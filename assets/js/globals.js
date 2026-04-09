// Ensure inline HTML handlers work safely
if(typeof initMic === 'undefined') console.error('initMic not found on window');
if(typeof toggleMute === 'undefined') console.error('toggleMute not found on window');
if(typeof sendManual === 'undefined') console.error('sendManual not found on window');
if(typeof runHint === 'undefined') console.error('runHint not found on window');
if(typeof clearLog === 'undefined') console.error('clearLog not found on window');
if(typeof bootRoleGate === 'undefined') console.error('bootRoleGate not found on window');
if(typeof enterAsCustomer === 'undefined') console.error('enterAsCustomer not found on window');
if(typeof enterAsSupervisor === 'undefined') console.error('enterAsSupervisor not found on window');
if(typeof initFirebaseSync === 'undefined') console.error('initFirebaseSync not found on window');