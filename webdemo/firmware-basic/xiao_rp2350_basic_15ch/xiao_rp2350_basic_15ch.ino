#include <Wire.h>
#include <Adafruit_MCP4728.h>

#define TOTAL_CHANNELS 15
#define FRAME_HEADER 0xAA
#define FRAME_FOOTER 0x55

Adafruit_MCP4728 dac;
uint8_t frame[TOTAL_CHANNELS + 3];
uint8_t index = 0;
bool receiving = false;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  dac.begin(0x60);
}

void loop() {
  while (Serial.available()) {
    uint8_t b = Serial.read();
    if (!receiving && b == FRAME_HEADER) {
      receiving = true;
      index = 1;
      frame[0] = b;
    } else if (receiving) {
      frame[index++] = b;
      if (index >= TOTAL_CHANNELS + 3) {
        if (frame[index - 1] == FRAME_FOOTER) {
          for (int ch = 0; ch < TOTAL_CHANNELS; ch++) {
            int finger = ch / 3;
            int part   = ch % 3;
            uint16_t val = frame[1 + ch] * 4095 / 255;
            switch (part) {
              case 0: dac.setChannelValue((Adafruit_MCP4728::Channel)0, val); break;
              case 1: dac.setChannelValue((Adafruit_MCP4728::Channel)1, val); break;
              case 2: dac.setChannelValue((Adafruit_MCP4728::Channel)2, val); break;
            }
          }
        }
        receiving = false;
      }
    }
  }
}
