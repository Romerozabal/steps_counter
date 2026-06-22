from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    data_file = LaunchConfiguration('data_file', default='pasos.json')
    poll_hz = LaunchConfiguration('poll_hz', default='5.0')

    return LaunchDescription([
        DeclareLaunchArgument('data_file', default_value='pasos.json', description='Path to pasos.json'),
        DeclareLaunchArgument('poll_hz', default_value='5.0', description='Polling frequency (Hz)'),
        Node(
            package='contador_pasos_ros2',
            executable='step_publisher',
            name='step_publisher',
            output='screen',
            parameters=[{'poll_hz': poll_hz}],
            emulate_tty=True,
            env=[('STEP_DATA_FILE', data_file), ('STEP_POLL_HZ', poll_hz)],
        )
    ])
