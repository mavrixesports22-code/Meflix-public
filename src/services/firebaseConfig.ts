import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration provided by user
export const firebaseConfig = {
  apiKey: "AIzaSyCJSZz0FgGzzj37i5R5RgEMaV1NzjskHKY",
  authDomain: "meflix-544c6.firebaseapp.com",
  projectId: "meflix-544c6",
  storageBucket: "meflix-544c6.firebasestorage.app",
  messagingSenderId: "743556408821",
  appId: "1:743556408821:web:add734f3a7062f1d6aecbc",
  measurementId: "G-2X63HDP511"
};

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firestore = getFirestore(firebaseApp);
