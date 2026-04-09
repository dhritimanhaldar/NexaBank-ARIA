function detectProfileFieldToUpdate(text){
  const t = text.toLowerCase();
  if(/\bmobile\b|\bphone\b|\bcontact number\b/.test(t)) return 'mobile';
  if(/\bemail\b|\bmail\b/.test(t)) return 'email';
  if(/\baddress\b/.test(t)) return 'address';
  if(/\bcity\b|\blocation\b/.test(t)) return 'city';
  if(/\bname\b/.test(t)) return 'fullName';
  if(/\bkyc\b/.test(t)) return 'kycStatus';
  return null;
}

function getCustomerProfileLabel(field){
  return {
    fullName: 'full name',
    mobile: 'mobile number',
    email: 'email address',
    city: 'city',
    address: 'address',
    panMasked: 'PAN',
    kycStatus: 'KYC status'
  }[field] || field;
}

window.detectProfileFieldToUpdate = detectProfileFieldToUpdate;
window.getCustomerProfileLabel = getCustomerProfileLabel;