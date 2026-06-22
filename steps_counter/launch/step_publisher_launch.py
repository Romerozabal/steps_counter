from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch_ros.actions import Node


def generate_launch_description():
    package_share = FindPackageShare('steps_counter')
    default_data_file = PathJoinSubstitution([package_share, 'steps.json'])
    web_app = PathJoinSubstitution([package_share, 'steps-counter.js'])

    data_file = LaunchConfiguration('data_file')
    poll_hz = LaunchConfiguration('poll_hz', default='5.0')
    port = LaunchConfiguration('port', default='3000')

    return LaunchDescription([
        DeclareLaunchArgument('data_file', default_value=default_data_file, description='Path to steps.json'),
        DeclareLaunchArgument('poll_hz', default_value='5.0', description='Polling frequency (Hz)'),
        DeclareLaunchArgument('port', default_value='3000', description='Web interface port'),
        ExecuteProcess(
            cmd=['node', web_app],
            name='steps_counter_web',
            output='screen',
            emulate_tty=True,
            additional_env={
                'PORT': port,
                'STEP_DATA_FILE': data_file,
            },
        ),
        Node(
            package='steps_counter',
            executable='step_publisher',
            name='step_publisher',
            output='screen',
            parameters=[{
                'data_file': data_file,
                'poll_hz': poll_hz,
            }],
            emulate_tty=True,
        )
    ])
