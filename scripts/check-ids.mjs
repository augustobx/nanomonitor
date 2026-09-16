const res = await fetch('https://monitor.nanolabs.com.ar/', { headers: { 'Accept': 'text/html' } });
const html = await res.text();

const idsToCheck = [
  'drawerHostname',
  'drawerSub',
  'dCpuName',
  'dCpuCores',
  'dRamTotal',
  'dMotherboard',
  'dIp',
  'dLatency',
  'dStorageList',
  'dAvName',
  'dAvStatus',
  'dFwStatus',
  'dRebootStatus',
  'dRebootReasonBox',
  'dRebootReasonText',
  'dHotfixTable',
  'dSoftwareTable',
  'softwareCountBadge',
  'deviceDrawer',
  'tabDevices',
  'tabEnroll',
  'tabCluster',
  'viewDevices',
  'viewEnroll',
  'viewCluster',
  'dTab1',
  'dTab2',
  'dTab3',
  'dTab4',
  'dViewSpecs',
  'dViewStorage',
  'dViewSecurity',
  'dViewSoftware'
];

console.log('--- CHECKING ELEMENT IDS IN LIVE HTML ---');
for (const id of idsToCheck) {
  const found = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  if (!found) {
    console.error(`MISSING ELEMENT ID: ${id}`);
  } else {
    console.log(`FOUND: ${id}`);
  }
}
