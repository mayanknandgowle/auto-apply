import { useState } from 'react';
import { createRoot } from 'react-dom/client';
function Controlled() {
  const [first,setFirst]=useState('');
  const [email,setEmail]=useState('');
  const [counter,setCounter]=useState(0);
  return <form onSubmit={event=>event.preventDefault()}><h2>React controlled form</h2><label>First name<input id="controlled-first" value={first} onChange={event=>setFirst(event.target.value)}/></label><label>Email<input id="controlled-email" value={email} onChange={event=>setEmail(event.target.value)}/></label><p id="react-state">{first} / {email}</p><button type="button" onClick={()=>setCounter(counter+1)}>Rerender {counter}</button></form>;
}
createRoot(document.getElementById('react-root')!).render(<Controlled/>);
