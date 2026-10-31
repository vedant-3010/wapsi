// Replays the test alert (F17), mood (F19) and missed-call (F18) flows on the LOCAL stack: dry run, no phone rings.
// Watch http://localhost:5173 while it runs:  node scripts/replay_local.mjs   (backend on :8000, local mode)
const API = process.env.API ?? 'http://localhost:8000'
const JSONH = { 'Content-Type': 'application/json' }
const TOOL = { ...JSONH, Authorization: 'Bearer local-tool' }
const post = (path, body = {}, headers = JSONH) => fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json())
const latestExec = () => fetch('http://127.0.0.1:3001/calls?select=bolna_execution_id&order=started_at.desc&limit=1').then((r) => r.json()).then((rows) => rows[0].bolna_execution_id)
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000))
const say = (s) => console.log(`\n▸ ${s}`)

say('Resetting the demo'); await post('/api/demo/reset'); await pause(3)

say('Test alert (F17): calling Patil Medical (no signal). Open the demo stage on the Soundbox card now.')
await post('/api/calls/start', { merchant_id: 'M002' }); let exec = await latestExec(); await pause(6)
await post('/api/bolna/webhook?token=local-hook', { id: exec, status: 'in-progress' }); await pause(2)
say('  diagnostics…'); await post('/api/tools/diagnostics', { merchant_id: 'M002' }, TOOL); await pause(3)
say('  remote restart…'); await post('/api/tools/restart-device', { merchant_id: 'M002' }, TOOL); await pause(3)
say('  test alert — the Soundbox should chime and say "Paytm वर 1 रुपये मिळाले"'); await post('/api/tools/test-soundbox', { merchant_id: 'M002' }, TOOL); await pause(7)

say('Mood (F19): the call ends and Bolna says the merchant sounded upset')
await post('/api/bolna/webhook?token=local-hook', { id: exec, status: 'completed', conversation_duration: 74,
  summary: 'Device was offline; restarted remotely and a test alert played.',
  extracted_data: { Merchant: { Mood: { objective: 'upset', confidence: 0.86 }, 'Mood reason': { subjective: 'Her Soundbox was silent for 3 days and she lost track of payments.' } } } })
say('  → "Mood · Upset" on the call card, and "Upset on the call" in the Handoff queue'); await pause(8)

say('Missed call (F18): calling Fernandes Bakery, who does not pick up')
await post('/api/calls/start', { merchant_id: 'M005' }); exec = await latestExec(); await pause(4)
await post('/api/bolna/webhook?token=local-hook', { id: exec, status: 'no-answer', conversation_duration: 0 })
say('  → WhatsApp + Retry steps in the feed, and a "Retry" chip on Fernandes Bakery\'s queue row'); await pause(2)
console.log('\nDone. Press Reset demo in the dashboard to start over.')
