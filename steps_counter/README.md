steps_counter
=============

Small ROS2 Python package that starts the web interface and publishes step counts from `steps.json`.

Topics published:
- `step_counts` (std_msgs/Int32MultiArray) -> [L, R, total]
- `step_session` (std_msgs/String) -> session name
- `step_timestamp` (std_msgs/Int64) -> last event timestamp (epoch ms)
- `step_events` (std_msgs/String) -> JSON array of active-session events

Build & run

```bash
# from workspace root (/home/biorobotics/ros2_ws)
colcon build --packages-select steps_counter
source install/setup.bash
# run with default steps.json in the current directory
ros2 run steps_counter step_publisher --ros-args -p data_file:=/home/biorobotics/ros2_ws/src/d2w/steps_counter/steps.json
# or via launch
ros2 launch steps_counter step_publisher_launch.py poll_hz:=5.0 port:=3000
```

Open the interface at `http://localhost:3000`.
