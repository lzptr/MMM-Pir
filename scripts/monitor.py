import RPi.GPIO as GPIO
import time
import argparse
import sys
import signal
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def signal_handler(signum, frame):
    """Clean up GPIO on signal"""
    GPIO.cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def setup_gpio(gpio_pin, as_input=True):
    """Setup GPIO with error handling"""
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        if as_input:
            GPIO.setup(gpio_pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        else:
            GPIO.setup(gpio_pin, GPIO.OUT)
        return True
    except Exception as e:
        logger.error(f"GPIO setup error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-v", "--verbose", help="verbose output", action="store_true")
    parser.add_argument("-g", "--gpio", type=int, default=21, help="define GPIO pin")
    parser.add_argument("-r", "--relay", type=int, choices=[0, 1], help="relay state")
    parser.add_argument("-t", "--toggle", help="toggle GPIO state", action="store_true")
    parser.add_argument("-c", "--clean", help="cleanup GPIO", action="store_true")
    parser.add_argument("-s", "--state", help="query GPIO state", action="store_true")
    parser.add_argument(
        "-m", "--monitor", help="monitor GPIO input", action="store_true"
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)
        logger.debug(f"GPIO: {args.gpio}")
        logger.debug(f"Mode: {'input' if args.monitor or args.state else 'output'}")

    # Initialize GPIO
    if not setup_gpio(args.gpio, args.monitor or args.state):
        sys.exit(1)

    try:
        if args.clean:
            GPIO.cleanup()
            logger.debug("GPIO cleanup completed")
            return

        if args.state:
            state = GPIO.input(args.gpio)
            print(state)
            return

        if args.monitor:
            logger.debug(f"Starting monitor on GPIO {args.gpio}")
            last_state = GPIO.input(args.gpio)
            while True:
                current_state = GPIO.input(args.gpio)
                if current_state != last_state:
                    if current_state:
                        print("1")
                        sys.stdout.flush()
                    last_state = current_state
                time.sleep(0.1)

        if args.toggle:
            GPIO.output(args.gpio, GPIO.HIGH)
            time.sleep(0.1)
            GPIO.output(args.gpio, GPIO.LOW)
            print("Toggled")
            return

        if args.relay is not None:
            GPIO.output(args.gpio, GPIO.HIGH if args.relay else GPIO.LOW)
            print("ON" if args.relay else "OFF")
            return

    except Exception as e:
        logger.error(f"Error: {e}")
        GPIO.cleanup()
        sys.exit(1)

    finally:
        if not (args.monitor or args.state):
            GPIO.cleanup()


if __name__ == "__main__":
    main()
