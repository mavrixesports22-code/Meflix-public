import { NetMirrorService } from './netmirrorService';

// The source's /newtv/ott.php advertises pv. Catalog metadata responses also
// identify themselves as ott: pv; this instance never uses the nf selector.
export const primeSourceService = new NetMirrorService('pv');
