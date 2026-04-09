// Ensure inline HTML handlers work safely
if(typeof initMic === 'undefined') console.error('initMic not found on window');
if(typeof toggleMute === 'undefined') console.error('toggleMute not found on window');
if(typeof sendManual === 'undefined') console.error('sendManual not found on window');
if(typeof runHint === 'undefined') console.error('runHint not found on window');
if(typeof clearLog === 'undefined') console.error('clearLog not found on window');
if(typeof exportLog === 'undefined') console.error('exportLog not found on window');