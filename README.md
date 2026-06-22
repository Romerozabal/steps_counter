# Steps Counter

Steps Counter is a small tool for manually marking left and right steps during
gait experiments. It provides a mobile-friendly web interface and an optional
ROS 2 publisher so the manual labels can be used while developing or testing
step-segmentation algorithms.

The web app stores each button press with the computer timestamp in epoch
milliseconds. The ROS 2 node watches the same JSON file and publishes the active
session counts and events.

## Features

- Web interface with large left/right step buttons for phone or tablet use.
- Session-based recording in `steps.json`.
- CSV export for one or more sessions.
- HTML/SVG timeline figure generation.
- ROS 2 launch file that starts both the web interface and publisher.
- ROS 2 topics for counts, active session, latest timestamp, and event JSON.

## Repository Layout

```text
.
├── steps-counter.js              # Node.js web interface
├── steps.json                    # Example/persistent step data
├── steps.backup-before-merge.json
├── export-all-csv.js             # Offline CSV export helper
├── generate-figure.js            # Offline timeline figure helper
├── figure-Gait_t1.html           # Example generated timeline
└── steps_counter/                # ROS 2 ament_python package
```

## Requirements

For the web interface only:

- Node.js 14 or newer

For ROS 2 integration:

- ROS 2 with `rclpy`, `std_msgs`, `launch`, and `launch_ros`
- `colcon`
- Node.js, because the ROS launch file starts the web server too

On Ubuntu with ROS 2 already configured, the usual dependencies are:

```bash
sudo apt update
sudo apt install nodejs python3-colcon-common-extensions
```

Source your ROS 2 installation before building:

```bash
source /opt/ros/<distro>/setup.bash
```

Replace `<distro>` with your ROS 2 distribution, for example `humble`,
`iron`, or `jazzy`.

## Web-Only Usage

Run the web interface directly from the repository root:

```bash
node steps-counter.js
```

Open the interface on the same computer:

```text
http://localhost:3000
```

From a phone or tablet on the same Wi-Fi network, open:

```text
http://COMPUTER-IP:3000
```

The server prints the available network URLs when it starts. To use another
port:

```bash
PORT=3001 node steps-counter.js
```

To write to a different data file:

```bash
STEP_DATA_FILE=/path/to/steps.json node steps-counter.js
```

Interaction shortcuts when using a laptop keyboard:

- `L`: record a left step.
- `R`: record a right step.
- `U`: undo the latest step in the active session.

## ROS 2 Installation

Clone this repository into a ROS 2 workspace:

```bash
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src
git clone https://github.com/Romerozabal/steps_counter.git
cd ~/ros2_ws
source /opt/ros/<distro>/setup.bash
colcon build --packages-select steps_counter
source install/setup.bash
```

## ROS 2 Usage

Start both the web interface and ROS 2 publisher:

```bash
ros2 launch steps_counter step_publisher_launch.py
```

By default, the launch file uses the installed package copy of `steps.json` and
serves the web interface on port `3000`.

For active experiment work, it is usually better to point the launch file at the
source-tree data file:

```bash
ros2 launch steps_counter step_publisher_launch.py \
  data_file:=~/ros2_ws/src/steps_counter/steps.json
```

Optional launch arguments:

```bash
ros2 launch steps_counter step_publisher_launch.py \
  data_file:=/path/to/steps.json \
  poll_hz:=5.0 \
  port:=3000
```

Then open the web interface:

```text
http://localhost:3000
```

The launch output also prints the phone/tablet URL for the current network.

## ROS 2 Topics

The publisher reads the active session from `steps.json` and publishes:

| Topic | Type | Meaning |
|---|---|---|
| `/step_counts` | `std_msgs/msg/Int32MultiArray` | `[left_count, right_count, total_count]` |
| `/step_session` | `std_msgs/msg/String` | Active session name |
| `/step_timestamp` | `std_msgs/msg/Int64` | Latest active-session step timestamp in epoch milliseconds |
| `/step_events` | `std_msgs/msg/String` | JSON array of active-session events |

Example checks:

```bash
ros2 topic echo /step_counts
ros2 topic echo /step_session
ros2 topic echo /step_events
```

You can also run only the publisher:

```bash
ros2 run steps_counter step_publisher --ros-args \
  -p data_file:=/path/to/steps.json \
  -p poll_hz:=5.0
```

## Data Format

`steps.json` stores the active session and all recorded events:

```json
{
  "session": "Gait t1",
  "events": [
    { "session": "Gait t1", "leg": "L", "t": 1781700500952 },
    { "session": "Gait t1", "leg": "R", "t": 1781700502502 }
  ]
}
```

Fields:

- `session`: session name.
- `leg`: `L` for left or `R` for right.
- `t`: computer timestamp in epoch milliseconds.

## Helper Scripts

Export every session to CSV files:

```bash
node export-all-csv.js
```

Generate a timeline figure for the latest session with events:

```bash
node generate-figure.js
```

The web interface also provides CSV and figure actions directly in the browser.

## Notes

- The phone and computer must be on the same network for phone access.
- Timestamps come from the computer running the Node.js server.
- `build/`, `install/`, `log/`, and `csv-export/` are generated locally and are
  ignored by git.
