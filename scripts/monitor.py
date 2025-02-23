import RPi.GPIO as GPIO
import time
import argparse, sys

parser = argparse.ArgumentParser()
parser.add_argument("-v", "--verbose", help="verbose output", action="store_true")
parser.add_argument(
    "-g",
    "--gpio",
    type=int,
    choices=[
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
    ],
    default=20,
    help="define GPIO output",
)
parser.add_argument(
    "-r",
    "--relay",
    type=int,
    choices=[0, 1],
    default=0,
    help="define relay state ON = 1, OFF = 0",
)
parser.add_argument("-t", "--toggle", help="toggle GPIO state", action="store_true")
parser.add_argument("-c", "--clean", help="cleanup GPIO", action="store_true")
parser.add_argument(
    "-s", "--state", help="query state of the GPIO and exit", action="store_true"
)
parser.add_argument(
    "-m", "--monitor", help="monitor GPIO input state", action="store_true"
)

args = parser.parse_args(None if sys.argv[1:] else ["-h"])
gpio = args.gpio

if args.verbose:
    print("Used Args:")
    print("GPIO: " + str(gpio))
    print("Relay: " + str(args.relay))
    print("Toggle: " + str(args.toggle))
    print("Cleanup: " + str(args.clean))
    print("State: " + str(args.state))
    print("Monitor: " + str(args.monitor))

# GPIO setup
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Setup GPIO based on mode
if args.monitor or args.state:
    GPIO.setup(gpio, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
else:
    GPIO.setup(gpio, GPIO.OUT)

if args.state:
    print(str(GPIO.input(gpio)))
    exit()

if args.monitor:
    try:
        if args.verbose:
            print(f"Monitoring GPIO {gpio}...")
        while True:
            state = GPIO.input(gpio)
            if state:
                print("1")
            time.sleep(0.1)  # Check every 100ms
    except KeyboardInterrupt:
        GPIO.cleanup()
        exit()

if args.toggle:
    # Simple toggle - just pulse the GPIO briefly
    GPIO.output(gpio, GPIO.HIGH)
    time.sleep(0.1)  # 100ms pulse
    GPIO.output(gpio, GPIO.LOW)
    print("Toggled")
    if args.clean:
        GPIO.cleanup()
    exit()

# Regular relay control
if args.relay == 1:
    GPIO.output(gpio, GPIO.HIGH)
    print("ON")
else:
    GPIO.output(gpio, GPIO.LOW)
    print("OFF")

if args.clean:
    GPIO.cleanup()
