// Banshee Band wristband firmware for the ESP32 (arduino-esp32 core 3.x, built-in BLE library).
//
// The page (src/band/ble-output.ts) writes one frame per alert to the command characteristic. This sketch
// checks the frame by the same rules, in the same order, as decodeFrame in src/band/protocol.ts, then plays
// its segments on two vibration motors without blocking. The protocol is documented in firmware/README.md.
// The band is an aid, not a safety device.

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

static const char* SERVICE_UUID = "b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba";
static const char* COMMAND_UUID = "b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba";
static const char* BAND_NAME = "Banshee Band";

static const uint8_t PROTOCOL_VERSION = 0x01;
static const uint8_t OP_PLAY = 0x01;
static const uint8_t OP_STOP = 0x02;
static const uint8_t MAX_SEGMENTS = 64;
static const uint8_t CRC_POLYNOMIAL = 0x07;
static const uint8_t CLASS_MIN = 1;  // knock 1, doorbell 2, alarm 3, baby 4, vehicle 5, voice 6
static const uint8_t CLASS_MAX = 6;
static const uint8_t SIDE_MAX = 3;   // unknown 0, left 1, centre 2, right 3
static const size_t MAX_FRAME = 6 + 4 * 64;

static const uint8_t LEFT_MOTOR_PIN = 25;
static const uint8_t RIGHT_MOTOR_PIN = 26;
static const uint32_t PWM_FREQUENCY = 20000;  // above hearing, so the motors do not whine
static const uint8_t PWM_BITS = 8;            // duty 0..255 = the level byte

enum ParseError { PARSE_OK, TOO_SHORT, BAD_VERSION, BAD_OPCODE, BAD_LENGTH, BAD_CHECKSUM, BAD_CLASS, BAD_SIDE, BAD_COUNT, BAD_DURATION };
static const char* ERROR_NAMES[] = {"ok", "too-short", "bad-version", "bad-opcode", "bad-length", "bad-checksum", "bad-class", "bad-side", "bad-count", "bad-duration"};

struct Segment {
  uint16_t ms;
  uint8_t left;
  uint8_t right;
};

// The frame the BLE task received, handed to loop() under a lock.
static uint8_t pending[MAX_FRAME];
static size_t pendingLength = 0;
static bool hasPending = false;
static bool tooLong = false;
static portMUX_TYPE pendingLock = portMUX_INITIALIZER_UNLOCKED;

// What is playing.
static Segment segments[MAX_SEGMENTS];
static uint8_t segmentCount = 0;
static uint8_t current = 0;
static uint32_t segmentStart = 0;
static bool playing = false;

static volatile bool disconnected = false;

uint8_t crc8(const uint8_t* bytes, size_t length) {
  uint8_t crc = 0;
  for (size_t i = 0; i < length; i++) {
    crc ^= bytes[i];
    for (int bit = 0; bit < 8; bit++) crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ CRC_POLYNOMIAL) : (uint8_t)(crc << 1);
  }
  return crc;
}

// Checks a frame in the order of decodeFrame. On PARSE_OK, *op is the opcode and, for PLAY, out/count hold the segments.
ParseError parseFrame(const uint8_t* b, size_t n, uint8_t* op, Segment* out, uint8_t* count) {
  if (n < 3) return TOO_SHORT;
  if (b[0] != PROTOCOL_VERSION) return BAD_VERSION;
  if (b[1] != OP_PLAY && b[1] != OP_STOP) return BAD_OPCODE;
  if (b[1] == OP_STOP ? n != 3 : (n < 6 || n != 6 + 4 * (size_t)b[4])) return BAD_LENGTH;
  if (crc8(b, n - 1) != b[n - 1]) return BAD_CHECKSUM;
  *op = b[1];
  if (b[1] == OP_STOP) return PARSE_OK;
  if (b[2] < CLASS_MIN || b[2] > CLASS_MAX) return BAD_CLASS;
  if (b[3] > SIDE_MAX) return BAD_SIDE;
  if (b[4] < 1 || b[4] > MAX_SEGMENTS) return BAD_COUNT;
  for (uint8_t i = 0; i < b[4]; i++) {
    const uint8_t* s = b + 5 + 4 * i;
    uint16_t ms = (uint16_t)s[0] | ((uint16_t)s[1] << 8);
    if (ms == 0) return BAD_DURATION;
    out[i] = {ms, s[2], s[3]};
  }
  *count = b[4];
  return PARSE_OK;
}

void setMotors(uint8_t left, uint8_t right) {
  ledcWrite(LEFT_MOTOR_PIN, left);
  ledcWrite(RIGHT_MOTOR_PIN, right);
}

void stopPlaying() {
  playing = false;
  setMotors(0, 0);
}

void startSegment(uint8_t index) {
  current = index;
  segmentStart = millis();
  setMotors(segments[index].left, segments[index].right);
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { Serial.println("connected"); }
  void onDisconnect(BLEServer*) override { disconnected = true; }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    size_t n = c->getLength();
    portENTER_CRITICAL(&pendingLock);
    if (n > MAX_FRAME) {
      tooLong = true;
    } else {
      memcpy(pending, c->getData(), n);
      pendingLength = n;
      hasPending = true;
    }
    portEXIT_CRITICAL(&pendingLock);
  }
};

void setup() {
  Serial.begin(115200);
  ledcAttach(LEFT_MOTOR_PIN, PWM_FREQUENCY, PWM_BITS);
  ledcAttach(RIGHT_MOTOR_PIN, PWM_FREQUENCY, PWM_BITS);
  setMotors(0, 0);

  BLEDevice::init(BAND_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  BLECharacteristic* command = service->createCharacteristic(COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  command->setCallbacks(new CommandCallbacks());
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("advertising as Banshee Band");
}

void loop() {
  if (disconnected) {
    disconnected = false;
    stopPlaying();
    delay(200);  // let the stack finish the disconnect before advertising again
    BLEDevice::startAdvertising();
    Serial.println("disconnected, advertising again");
  }

  uint8_t frame[MAX_FRAME];
  size_t length = 0;
  bool got = false;
  bool overflow = false;
  portENTER_CRITICAL(&pendingLock);
  if (hasPending) {
    memcpy(frame, pending, pendingLength);
    length = pendingLength;
    hasPending = false;
    got = true;
  }
  overflow = tooLong;
  tooLong = false;
  portEXIT_CRITICAL(&pendingLock);
  if (overflow) Serial.println("frame ignored: bad-length");

  if (got) {
    uint8_t op = 0;
    uint8_t count = 0;
    Segment parsed[MAX_SEGMENTS];
    ParseError error = parseFrame(frame, length, &op, parsed, &count);
    if (error != PARSE_OK) {
      Serial.print("frame ignored: ");
      Serial.println(ERROR_NAMES[error]);
    } else if (op == OP_STOP) {
      stopPlaying();
    } else {
      // A new PLAY replaces whatever plays.
      memcpy(segments, parsed, sizeof(Segment) * count);
      segmentCount = count;
      playing = true;
      startSegment(0);
    }
  }

  if (playing && millis() - segmentStart >= segments[current].ms) {
    if (current + 1 < segmentCount) startSegment(current + 1);
    else stopPlaying();
  }
}
