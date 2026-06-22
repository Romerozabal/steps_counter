import json
import os
from pathlib import Path
from typing import Tuple

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from std_msgs.msg import Int32MultiArray, String, Int64


def read_counts_from_data(data: dict) -> Tuple[int, int, int, int, str, list]:
    session = data.get('session', '')
    events = data.get('events', [])
    session_events = [
        e for e in events
        if e.get('session') == session and e.get('leg') in ('L', 'R')
    ]
    L = sum(1 for e in session_events if e.get('leg') == 'L')
    R = sum(1 for e in session_events if e.get('leg') == 'R')
    total = L + R
    last_ts = 0
    for e in reversed(session_events):
        if isinstance(e.get('t'), (int, float)):
            last_ts = int(e.get('t'))
            break
    return L, R, total, last_ts, session, session_events


class StepPublisher(Node):
    def __init__(self):
        super().__init__('step_publisher')
        default_data_file = os.environ.get(
            'STEP_DATA_FILE',
            os.path.join(os.getcwd(), 'steps.json'),
        )
        default_poll_hz = float(os.environ.get('STEP_POLL_HZ', '5.0'))

        self.declare_parameter('data_file', default_data_file)
        self.declare_parameter('poll_hz', default_poll_hz)

        data_file = self.get_parameter('data_file').value
        poll_hz = self.get_parameter('poll_hz').value
        self._data_file = Path(data_file)
        qos = QoSProfile(depth=10)
        qos.durability = DurabilityPolicy.TRANSIENT_LOCAL
        qos.reliability = ReliabilityPolicy.RELIABLE

        self._pub = self.create_publisher(Int32MultiArray, 'step_counts', qos)
        self._session_pub = self.create_publisher(String, 'step_session', qos)
        self._ts_pub = self.create_publisher(Int64, 'step_timestamp', qos)
        self._events_pub = self.create_publisher(String, 'step_events', qos)

        self._poll_period = 1.0 / float(poll_hz)
        self._last_values = (None, None, None, None, None, None)
        self._last_mtime = None

        self.get_logger().info(f'Reading steps from: {self._data_file}')
        self.get_logger().info(
            'Publishing step_counts, step_session, step_timestamp, and step_events'
        )
        self.timer = self.create_timer(self._poll_period, self.timer_cb)

    def read_file(self):
        try:
            text = self._data_file.read_text(encoding='utf-8')
            data = json.loads(text)
            return data
        except Exception:
            return None

    def timer_cb(self):
        # check mtime to avoid re-parsing unchanged files
        try:
            mtime = self._data_file.stat().st_mtime
        except Exception:
            mtime = None
        if mtime is not None and mtime == self._last_mtime:
            return
        self._last_mtime = mtime

        data = self.read_file()
        if not isinstance(data, dict):
            L, R, total, last_ts, session, events = 0, 0, 0, 0, '', []
        else:
            L, R, total, last_ts, session, events = read_counts_from_data(data)

        events_json = json.dumps(events, separators=(',', ':'))
        cur = (L, R, total, last_ts, session, events_json)
        if cur != self._last_values:
            msg = Int32MultiArray()
            msg.data = [int(L), int(R), int(total)]
            self._pub.publish(msg)

            s = String()
            s.data = str(session)
            self._session_pub.publish(s)

            ts = Int64()
            ts.data = int(last_ts)
            self._ts_pub.publish(ts)

            ev = String()
            ev.data = events_json
            self._events_pub.publish(ev)

            self.get_logger().info(
                f'Published L={L} R={R} total={total} ts={last_ts} session="{session}"'
            )
            self._last_values = cur


def main(args=None):
    rclpy.init(args=args)
    node = StepPublisher()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
