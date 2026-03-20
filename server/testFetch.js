async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/generate-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirement: 'provide the list of employees alongwith their managers where manager is in Inactive status' })
    });
    const text = await res.text();
    console.log(res.status, text);
  } catch(e) {
    console.error(e);
  }
}
run();
