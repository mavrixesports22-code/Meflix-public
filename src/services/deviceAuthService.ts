import { Platform } from 'react-native';
import { StorageService } from './storageService';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';

export interface DeviceAccessRequest {
  deviceId: string;
  name: string;
  ip: string;
  platform: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: number;
  revokedAt?: number;
  note?: string;
}

const DEVICE_ID_KEY = 'meflix_device_id_v1';
const REQUESTS_KEY = 'meflix_access_requests_v1';
const WHITELIST_KEY = 'meflix_whitelisted_ips_v1';
const ADMIN_PIN_KEY = 'meflix_admin_pin_v1';

const DEFAULT_ADMIN_PIN = '778899';

class DeviceAuthService {
  private cachedIp: string | null = null;
  private cachedDeviceId: string | null = null;

  /**
   * Helper to produce a safe document key for IP strings
   */
  private getSafeIpKey(ip: string): string {
    return ip.trim().replace(/[\.\:\/]/g, '_');
  }

  /**
   * Detects the device's public or local IP address
   */
  public async detectIp(): Promise<string> {
    if (this.cachedIp) return this.cachedIp;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          this.cachedIp = String(data.ip).trim();
          return this.cachedIp;
        }
      }
    } catch {}

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://icanhazip.com', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text) {
          this.cachedIp = text;
          return this.cachedIp;
        }
      }
    } catch {}

    // Fallback IP for offline/simulator
    this.cachedIp = '192.168.1.100';
    return this.cachedIp;
  }

  /**
   * Returns a persistent unique identifier for this device
   */
  public async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) return this.cachedDeviceId;

    let id = await StorageService.getItem<string | null>(DEVICE_ID_KEY, null);
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
      const time = Date.now().toString(36).substring(4).toUpperCase();
      id = `DEV-${rand}-${time}`;
      await StorageService.setItem(DEVICE_ID_KEY, id);
    }
    this.cachedDeviceId = id;
    return id;
  }

  /**
   * Returns human-readable platform name
   */
  public getPlatformName(): string {
    const os = Platform.OS;
    if (os === 'ios') return 'Apple iOS';
    if (os === 'android') return 'Android';
    if (os === 'web') return 'Web Browser';
    if (os === 'windows') return 'Windows';
    return 'Mobile Device';
  }

  /**
   * Cleans up local approval and removes IP from local whitelist when access is revoked
   */
  public async purgeLocalApproval(
    deviceId: string,
    ip: string,
    newStatus: 'pending' | 'rejected' | 'unregistered',
    cloudReq?: DeviceAccessRequest
  ): Promise<void> {
    try {
      // 1. Remove IP from local whitelist
      const currentWhitelist = await StorageService.getItem<string[]>(WHITELIST_KEY, []);
      const updatedWhitelist = currentWhitelist.filter(x => x !== ip);
      await StorageService.setItem(WHITELIST_KEY, updatedWhitelist);

      // 2. Update local requests storage
      const requests = await StorageService.getItem<DeviceAccessRequest[]>(REQUESTS_KEY, []);
      const existingIndex = requests.findIndex(r => r.deviceId === deviceId);
      if (existingIndex >= 0) {
        if (newStatus === 'unregistered') {
          requests.splice(existingIndex, 1);
        } else {
          requests[existingIndex] = {
            ...requests[existingIndex],
            status: newStatus,
            ...(cloudReq || {}),
          };
        }
        await StorageService.setItem(REQUESTS_KEY, requests);
      } else if (newStatus !== 'unregistered' && cloudReq) {
        requests.unshift(cloudReq);
        await StorageService.setItem(REQUESTS_KEY, requests);
      }
    } catch {}
  }

  /**
   * Syncs an approved cloud request to local storage
   */
  public async syncLocalRequest(request: DeviceAccessRequest): Promise<void> {
    try {
      const requests = await StorageService.getItem<DeviceAccessRequest[]>(REQUESTS_KEY, []);
      const idx = requests.findIndex(r => r.deviceId === request.deviceId);
      if (idx >= 0) {
        requests[idx] = request;
      } else {
        requests.unshift(request);
      }
      await StorageService.setItem(REQUESTS_KEY, requests);
    } catch {}
  }

  /**
   * Checks the authorization status of the current device.
   * Priority: Firebase Cloud Firestore is the authoritative remote source of truth.
   * If an admin revokes approval or declines access in Firestore, any cached local
   * approval and whitelist are immediately purged so the user cannot access the app.
   */
  public async checkDeviceStatus(): Promise<{
    status: 'approved' | 'pending' | 'rejected' | 'unregistered';
    request?: DeviceAccessRequest;
    ip: string;
    deviceId: string;
  }> {
    const deviceId = await this.getDeviceId();
    const ip = await this.detectIp();
    const safeIpKey = this.getSafeIpKey(ip);

    // 1. Authoritative check: Firebase Cloud Firestore
    try {
      const [reqSnap, ipSnap] = await Promise.all([
        getDoc(doc(firestore, 'device_requests', deviceId)).catch(() => null),
        getDoc(doc(firestore, 'whitelisted_ips', safeIpKey)).catch(() => null),
      ]);

      const isIpInCloudWhitelist = Boolean(ipSnap && ipSnap.exists());
      const cloudReq = reqSnap && reqSnap.exists() ? (reqSnap.data() as DeviceAccessRequest) : null;

      // Case A: Device Request exists in Firestore
      if (cloudReq) {
        if (cloudReq.status === 'approved') {
          // Explicitly approved by admin
          await this.syncLocalRequest(cloudReq);
          if (cloudReq.ip) {
            await this.addWhitelistedIp(cloudReq.ip);
          }
          return {
            status: 'approved',
            request: cloudReq,
            ip,
            deviceId,
          };
        } else {
          // REVOKED / REJECTED / PENDING:
          // Immediately purge local approval and whitelist so user cannot bypass!
          await this.purgeLocalApproval(deviceId, ip, cloudReq.status, cloudReq);
          return {
            status: cloudReq.status,
            request: cloudReq,
            ip,
            deviceId,
          };
        }
      }

      // Case B: No specific device request, but IP is in Cloud Whitelist
      if (isIpInCloudWhitelist) {
        await this.addWhitelistedIp(ip);
        return { status: 'approved', ip, deviceId };
      }

      // Case C: Neither exists in Cloud Firestore (Admin deleted/revoked request)
      // Immediately purge local approval and whitelist!
      await this.purgeLocalApproval(deviceId, ip, 'unregistered');
      return { status: 'unregistered', ip, deviceId };
    } catch {
      // Offline fallback: ONLY executed if device has no network or Firebase is unreachable
    }

    // 2. Offline Fallback (Local Storage cache only when offline)
    const requests = await this.getAllRequests();
    const req = requests.find(r => r.deviceId === deviceId || (r.ip && r.ip === ip));

    if (!req) {
      const whitelisted = await this.getWhitelistedIps();
      if (whitelisted.includes(ip)) {
        return { status: 'approved', ip, deviceId };
      }
      return { status: 'unregistered', ip, deviceId };
    }

    if (req.status === 'approved') {
      const whitelisted = await this.getWhitelistedIps();
      if (whitelisted.includes(ip)) {
        return { status: 'approved', request: req, ip, deviceId };
      }
    }

    return {
      status: req.status,
      request: req,
      ip,
      deviceId,
    };
  }

  /**
   * Subscribes to real-time status changes for this device.
   * If an admin clicks "Revoke Access" in the admin panel or updates Firestore,
   * this listener immediately fires and triggers the callback so the app locks seamlessly.
   */
  public subscribeToDeviceStatus(
    onStatusChange: (status: 'approved' | 'pending' | 'rejected' | 'unregistered', req?: DeviceAccessRequest) => void
  ): () => void {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    this.getDeviceId().then(async deviceId => {
      if (isCancelled) return;
      const ip = await this.detectIp();
      const safeIpKey = this.getSafeIpKey(ip);

      try {
        const reqDocRef = doc(firestore, 'device_requests', deviceId);
        unsubscribe = onSnapshot(
          reqDocRef,
          async snap => {
            if (isCancelled) return;
            if (snap.exists()) {
              const data = snap.data() as DeviceAccessRequest;
              if (data.status === 'approved') {
                await this.syncLocalRequest(data);
                if (data.ip) await this.addWhitelistedIp(data.ip);
                onStatusChange('approved', data);
              } else {
                // Real-time Revocation!
                await this.purgeLocalApproval(deviceId, ip, data.status, data);
                onStatusChange(data.status, data);
              }
            } else {
              // Document was removed/deleted in cloud
              try {
                const ipSnap = await getDoc(doc(firestore, 'whitelisted_ips', safeIpKey));
                if (ipSnap.exists()) {
                  await this.addWhitelistedIp(ip);
                  onStatusChange('approved');
                } else {
                  await this.purgeLocalApproval(deviceId, ip, 'unregistered');
                  onStatusChange('unregistered');
                }
              } catch {
                await this.purgeLocalApproval(deviceId, ip, 'unregistered');
                onStatusChange('unregistered');
              }
            }
          },
          () => {
            // Ignored if offline
          }
        );
      } catch {}
    });

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }

  /**
   * Submits a new access request for this device
   */
  public async submitAccessRequest(name: string): Promise<DeviceAccessRequest> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }

    const deviceId = await this.getDeviceId();
    const ip = await this.detectIp();
    const platform = this.getPlatformName();

    const newRequest: DeviceAccessRequest = {
      deviceId,
      name: cleanName,
      ip,
      platform,
      requestedAt: Date.now(),
      status: 'pending',
    };

    // Update Local Storage
    const requests = await this.getAllRequests();
    const existingIndex = requests.findIndex(r => r.deviceId === deviceId);
    if (existingIndex >= 0) {
      requests[existingIndex] = newRequest;
    } else {
      requests.unshift(newRequest);
    }
    await StorageService.setItem(REQUESTS_KEY, requests);

    // Sync to Firebase Cloud Firestore
    try {
      await setDoc(doc(firestore, 'device_requests', deviceId), newRequest, { merge: true });
    } catch (err) {
      console.warn('Firestore sync note (rules or offline):', err);
    }

    return newRequest;
  }

  /**
   * Verifies the administrator passcode
   */
  public async verifyAdminPin(pin: string): Promise<boolean> {
    const savedPin = await StorageService.getItem<string>(ADMIN_PIN_KEY, DEFAULT_ADMIN_PIN);
    return pin.trim() === savedPin.trim();
  }

  /**
   * Updates administrator passcode
   */
  public async updateAdminPin(newPin: string): Promise<void> {
    if (!/^\d{4,8}$/.test(newPin.trim())) {
      throw new Error('PIN must be 4 to 8 digits.');
    }
    await StorageService.setItem(ADMIN_PIN_KEY, newPin.trim());
  }

  /**
   * Retrieves all device access requests
   */
  public async getAllRequests(): Promise<DeviceAccessRequest[]> {
    // Try fetching live list from Firebase
    try {
      const snap = await getDocs(collection(firestore, 'device_requests'));
      if (!snap.empty) {
        const cloudItems: DeviceAccessRequest[] = [];
        snap.forEach(d => {
          cloudItems.push(d.data() as DeviceAccessRequest);
        });
        cloudItems.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
        await StorageService.setItem(REQUESTS_KEY, cloudItems);
        return cloudItems;
      }
    } catch {}

    return StorageService.getItem<DeviceAccessRequest[]>(REQUESTS_KEY, []);
  }

  /**
   * Approves a device request and automatically whitelists its IP address
   */
  public async approveRequest(deviceId: string): Promise<void> {
    const requests = await this.getAllRequests();
    const target = requests.find(r => r.deviceId === deviceId);
    if (target) {
      target.status = 'approved';
      target.approvedAt = Date.now();
      await StorageService.setItem(REQUESTS_KEY, requests);

      if (target.ip) {
        await this.addWhitelistedIp(target.ip);
      }
    }

    // Sync to Firebase
    try {
      await setDoc(
        doc(firestore, 'device_requests', deviceId),
        {
          status: 'approved',
          approvedAt: Date.now(),
        },
        { merge: true }
      );
      if (target?.ip) {
        const safeIpKey = this.getSafeIpKey(target.ip);
        await setDoc(
          doc(firestore, 'whitelisted_ips', safeIpKey),
          {
            ip: target.ip,
            addedAt: Date.now(),
            approvedFor: target.name || deviceId,
          },
          { merge: true }
        );
      }
    } catch {}
  }

  /**
   * Rejects a device request
   */
  /**
   * Rejects / Revokes a device request and deletes its IP whitelist record
   */
  public async rejectRequest(deviceId: string): Promise<void> {
    let targetIp: string | undefined;

    const requests = await this.getAllRequests();
    const target = requests.find(r => r.deviceId === deviceId);
    if (target) {
      target.status = 'rejected';
      targetIp = target.ip;
      await StorageService.setItem(REQUESTS_KEY, requests);
      if (target.ip) {
        await this.removeWhitelistedIp(target.ip);
      }
    }

    // Sync to Firebase
    try {
      if (!targetIp) {
        const snap = await getDoc(doc(firestore, 'device_requests', deviceId));
        if (snap.exists()) {
          targetIp = (snap.data() as DeviceAccessRequest).ip;
        }
      }

      await setDoc(
        doc(firestore, 'device_requests', deviceId),
        {
          status: 'rejected',
          revokedAt: Date.now(),
        },
        { merge: true }
      );

      if (targetIp) {
        const safeIpKey = this.getSafeIpKey(targetIp);
        await deleteDoc(doc(firestore, 'whitelisted_ips', safeIpKey));
        await this.removeWhitelistedIp(targetIp);
      }
    } catch (err) {
      console.warn('Reject/Revoke sync error:', err);
    }
  }

  /**
   * Deletes a request and revokes device access completely
   */
  public async deleteRequest(deviceId: string): Promise<void> {
    let targetIp: string | undefined;

    const requests = await this.getAllRequests();
    const target = requests.find(r => r.deviceId === deviceId);
    if (target) {
      targetIp = target.ip;
    }
    const updated = requests.filter(r => r.deviceId !== deviceId);
    await StorageService.setItem(REQUESTS_KEY, updated);

    // Sync to Firebase
    try {
      if (!targetIp) {
        const snap = await getDoc(doc(firestore, 'device_requests', deviceId));
        if (snap.exists()) {
          targetIp = (snap.data() as DeviceAccessRequest).ip;
        }
      }

      await deleteDoc(doc(firestore, 'device_requests', deviceId));

      if (targetIp) {
        const safeIpKey = this.getSafeIpKey(targetIp);
        await deleteDoc(doc(firestore, 'whitelisted_ips', safeIpKey));
        await this.removeWhitelistedIp(targetIp);
      }
    } catch (err) {
      console.warn('Delete request sync error:', err);
    }
  }

  /**
   * Whitelists an IP address directly
   */
  public async addWhitelistedIp(ip: string): Promise<void> {
    const cleanIp = ip.trim();
    if (!cleanIp) return;
    const list = await this.getWhitelistedIps();
    if (!list.includes(cleanIp)) {
      list.push(cleanIp);
      await StorageService.setItem(WHITELIST_KEY, list);
    }

    // Sync to Firebase
    try {
      const safeIpKey = this.getSafeIpKey(cleanIp);
      await setDoc(
        doc(firestore, 'whitelisted_ips', safeIpKey),
        {
          ip: cleanIp,
          addedAt: Date.now(),
          note: 'Admin Whitelist',
        },
        { merge: true }
      );
    } catch {}
  }

  /**
   * Removes an IP address from the whitelist
   */
  public async removeWhitelistedIp(ip: string): Promise<void> {
    const cleanIp = ip.trim();
    const list = await StorageService.getItem<string[]>(WHITELIST_KEY, []);
    const updated = list.filter(item => item !== cleanIp);
    await StorageService.setItem(WHITELIST_KEY, updated);

    // Sync to Firebase
    try {
      const safeIpKey = this.getSafeIpKey(cleanIp);
      await deleteDoc(doc(firestore, 'whitelisted_ips', safeIpKey));
    } catch {}
  }

  /**
   * Retrieves all whitelisted IP addresses
   */
  public async getWhitelistedIps(): Promise<string[]> {
    try {
      const snap = await getDocs(collection(firestore, 'whitelisted_ips'));
      const cloudIps: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.ip) cloudIps.push(data.ip);
      });
      await StorageService.setItem(WHITELIST_KEY, cloudIps);
      return cloudIps;
    } catch {}

    return StorageService.getItem<string[]>(WHITELIST_KEY, []);
  }
}

export const deviceAuthService = new DeviceAuthService();
