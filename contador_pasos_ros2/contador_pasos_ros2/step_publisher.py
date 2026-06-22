import os
import time
import json
from typing import Tuple
import os
import time
import json
from typing import Tuple
from pathlib import Path

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy
from std_msgs.msg import Int32MultiArray, String, Int64


def read_counts_from_data(data: dict) -> Tuple[int, int, int, int, str]:
    session = data.get('session', '')
    events = data.get('events', [])
    L = sum(1 for e in events if e.get('session') == session and e.get('leg') == 'L')
    R = sum(1 for e in events if e.get('session') == session and e.get('leg') == 'R')
    total = L + R
    # find last event timestamp for this session (ms)
    last_ts = 0
    for e in reversed(events):
        if e.get('session') == session and isinstance(e.get('t'), (int, float)):
            last_ts = int(e.get('t'))
            break
    return L, R, total, last_ts, session


class StepPublisher(Node):
    def __init__(self, data_file: str, poll_hz: float = 5.0):
        super().__init__('step_publisher')
        self._data_file = Path(data_file)
        qos = QoSProfile(depth=10)
        qos.durability = DurabilityPolicy.TRANSIENT_LOCAL
        qos.reliability = ReliabilityPolicy.RELIABLE

        self._pub = self.create_publisher(Int32MultiArray, 'step_counts', qos)
        self._session_pub = self.create_publisher(String, 'step_session', qos)
        self._ts_pub = self.create_publisher(Int64, 'step_timestamp', qos)

        self._poll_period = 1.0 / float(poll_hz)
        self._last_values = (None, None, None, None, None)
        self._last_mtime = None

        self.get_logger().info(f'Reading steps from: {self._data_file}')
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
            # publish zeros/session empty if file missing
            L, R, total, last_ts, session = 0, 0, 0, 0, ''
        else:
            L, R, total, last_ts, session = read_counts_from_data(data)

        cur = (L, R, total, last_ts, session)
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

            self.get_logger().info(f'Published L={L} R={R} total={total} ts={last_ts} session="{session}"')
            self._last_values = cur


def main(args=None):
    rclpy.init(args=args)
    data_file = os.environ.get('STEP_DATA_FILE', os.path.join(os.getcwd(), 'pasos.json'))
    poll_hz = float(os.environ.get('STEP_POLL_HZ', '5.0'))
    node = StepPublisher(data_file, poll_hz=poll_hz)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
