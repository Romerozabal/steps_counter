# Steps Counter

Local **Node.js** web server with no external dependencies for manually marking
steps during gait experiments. It serves a mobile-friendly interface with two
large buttons, one for the left leg and one for the right leg.

Each button press is saved with the computer timestamp, not the phone
timestamp, under the active session name. The recorded data can be exported to
CSV and used as manual labels for step segmentation experiments.

## Usage

```bash
node contador-pasos.js
```

Then open the interface in a browser:

```text
http://localhost:3000
```

From a phone or tablet on the same Wi-Fi network, use the computer IP address:

```text
http://COMPUTER-IP:3000
```

The port can be changed with the `PORT` environment variable:

```bash
PORT=3001 node contador-pasos.js
```

## Files

| File | Description |
|---|---|
| `contador-pasos.js` | Main web application. |
| `pasos.json` | Persistent step/session data. |
| `pasos.backup-antes-de-unir.json` | Backup data file created before a data merge. |
| `exportar-todo-csv.js` | Exports all sessions to CSV files. |
| `generar-figura.js` | Generates an HTML/SVG timeline figure from the recorded data. |
| `figura-Marcha_t1.html` | Example generated gait timeline figure. |

## Data Format

The data file stores the active session and an array of events:

```json
{
  "session": "Session name",
  "events": [
    { "session": "Session name", "leg": "L", "t": 1781700500952 },
    { "session": "Session name", "leg": "R", "t": 1781700502502 }
  ]
}
```

`leg` is `L` for left and `R` for right. `t` is the computer timestamp in epoch
milliseconds.
