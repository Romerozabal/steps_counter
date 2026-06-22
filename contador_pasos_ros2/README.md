contador_pasos_ros2
===================

Small ROS2 Python package that publishes step counts from `pasos.json`.

Topics published:
- `step_counts` (std_msgs/Int32MultiArray) -> [L, R, total]
- `step_session` (std_msgs/String) -> session name
- `step_timestamp` (std_msgs/Int64) -> last event timestamp (epoch ms)

Build & run

```bash
# from workspace root (/home/biorobotics/contador-pasos)
colcon build --packages-select contador_pasos_ros2
source install/setup.bash
# run with default pasos.json in cwd
STEP_DATA_FILE=$PWD/pasos.json ros2 run contador_pasos_ros2 step_publisher
# or via launch
ros2 launch contador_pasos_ros2 step_publisher_launch.py data_file:=$PWD/pasos.json poll_hz:=5.0
```
