from setuptools import setup

package_name = 'contador_pasos_ros2'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=False,
    author='You',
    description='ROS2 publisher for step counts (pasos.json)',
    entry_points={
        'console_scripts': [
            'step_publisher = contador_pasos_ros2.step_publisher:main'
        ],
    },
)
