// MT-02 / SEC-06 — real 2-tenant isolation + non-admin RBAC probe. Run in nexus-crm.
const AUTH='http://auth-service:3000', CRM='http://crm-service:3001', FIN='http://finance-service:3002';
const login=async(email,password)=>{const r=await fetch(`${AUTH}/api/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json().catch(()=>({}));return {s:r.status,tok:j?.data?.accessToken};};
const H=t=>({authorization:`Bearer ${t}`,'content-type':'application/json'});
const call=async(m,u,t,b)=>{const r=await fetch(u,{method:m,headers:H(t),body:m==='GET'?undefined:JSON.stringify(b||{})});const x=await r.text();return{s:r.status,x};};
const findings=[];

(async()=>{
  const A=await login('admin@demo.com','Demo1234!');
  const B=await login('admin@rival.com','Rival1234!');
  const V=await login('viewer@demo.com','Viewer1234!');
  console.log('logins: demoAdmin',A.s, 'rivalAdmin',B.s, 'viewer',V.s);
  if(!A.tok||!B.tok||!V.tok){console.log('LOGIN FAILED — cannot run probe');return;}

  console.log('\n== ISOLATION: tenant B creates a record; tenant A must NOT read it ==');
  const acc=await call('POST',`${CRM}/api/v1/accounts`,B.tok,{name:'Rival Secret Account',type:'CUSTOMER',ownerId:'x'});
  let accId;try{accId=JSON.parse(acc.x).data.id}catch{}
  console.log('  tenantB create account ->',acc.s, accId?('id='+accId):acc.x.slice(0,80));
  if(accId){
    const leak=await call('GET',`${CRM}/api/v1/accounts/${accId}`,A.tok);
    if(leak.s===404||leak.s===403){console.log('  PASS: demo admin GET tenantB account ->',leak.s,'(isolated)');}
    else{findings.push(`🔴 SEC-26/MT-02: demo admin read tenant B's account (status ${leak.s}) — TENANT LEAK`);console.log('  FAIL leak:',leak.s,leak.x.slice(0,80));}
    // and B can read its own
    const own=await call('GET',`${CRM}/api/v1/accounts/${accId}`,B.tok);
    console.log('  tenantB reads its own account ->',own.s,'(expect 200)');
  }

  console.log('\n== RBAC: viewer (deals:read only) is blocked from privileged actions ==');
  const vRead=await call('GET',`${CRM}/api/v1/deals?limit=1`,V.tok);
  console.log('  viewer GET /deals ->',vRead.s,'(expect 200 — has deals:read)');
  if(vRead.s!==200) findings.push(`🟠 RBAC: viewer with deals:read got ${vRead.s} on GET /deals`);
  const vCreate=await call('POST',`${CRM}/api/v1/deals`,V.tok,{name:'x',pipelineId:'x',stageId:'x',ownerId:'x',amount:1,currency:'USD'});
  if(vCreate.s===403){console.log('  PASS: viewer POST /deals ->',vCreate.s,'(no deals:create)');}
  else findings.push(`🟠 SEC-06: viewer (no deals:create) POST /deals returned ${vCreate.s} (expected 403)`);
  const vAdmin=await call('POST',`${FIN}/api/v1/quotes/config/approval-tiers`,V.tok,{name:'x',level:1,minAmount:1});
  if(vAdmin.s===403){console.log('  PASS: viewer POST /quotes/config/approval-tiers ->',vAdmin.s,'(no settings:update)');}
  else findings.push(`🟠 SEC-25: viewer hit admin quote-config, returned ${vAdmin.s} (expected 403)`);
  const vRoles=await call('GET',`${AUTH}/api/v1/roles`,V.tok);
  if(vRoles.s===403){console.log('  PASS: viewer GET /roles ->',vRoles.s,'(no settings:read)');}
  else console.log('  NOTE: viewer GET /roles ->',vRoles.s,'(check if roles list needs a permission)');

  console.log('\n== RESULT ==');
  if(findings.length===0) console.log('  ALL ISOLATION + RBAC CHECKS PASSED');
  else findings.forEach(f=>console.log('  '+f));
  console.log('PROBE-DONE');
})().catch(e=>console.log('FATAL',e.stack||e.message));
