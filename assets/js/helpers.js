function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function actionLabel(a){ return{transfer:'Funds Transfer',payment:'Bill Payment',balance:'Balance Enquiry', block:'Card Block',statement:'Statement Request',international_transfer:'International Transfer',unknown:'Unrecognised Request'}[a]||a; }

window.Helpers = { esc, actionLabel };