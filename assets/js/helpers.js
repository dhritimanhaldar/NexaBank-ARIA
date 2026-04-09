function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function actionLabel(a){ return{transfer:'Transfer Money',payment:'Bill Payment',balance:'Balance Enquiry', block:'Card Block',statement:'Statement Request',unknown:'Unknown'}[a]||a; }

window.Helpers = { esc, actionLabel };