// Add projects inside the array below. Copy an existing entry,
// then replace the text and URLs with your own details.
// Projects appear in the order listed. Leave demo/image empty to omit them.
// Use double quotes around text and a comma between each project object.
window.PROJECTS = [
  {
  title: "16-bit SLC-3 Microprocessor on FPGA",
  id: "slc3-fpga-microprocessor",
  date: "October 2026",
  summary: "SystemVerilog CPU implemented on a Spartan-7 FPGA",
  description: "Designed and synthesized a 16-bit SLC-3 microprocessor in SystemVerilog for a Xilinx Spartan-7 FPGA, including the datapath, ALU, register file, memory-mapped I/O, instruction decoder, and multi-cycle finite-state control unit.",
  details: [
    "Created SystemVerilog testbenches and used Vivado behavioral and post-synthesis timing simulations to verify the fetch, decode, and execution cycle and resolve timing violations.",
    "Implemented arithmetic, logic, control-flow, and memory instructions—including ADD, AND, NOT, BR, JMP, JSR, LDR, and STR—with physical switches and hexadecimal displays connected through memory-mapped I/O.",
  ],
  technologies: ["SystemVerilog", "Xilinx Vivado", "Spartan-7 FPGA", "Computer Architecture"],
  github: "",
  demo: "",
  image: "",
  imageAlt: "",
},
  {
    title: "Spotify Media Controller",
    id: "spotify-media-controller",
    date: "June 2026",
    summary: "Embedded Spotify controller",
    description: "A physical Spotify controller built with a Raspberry Pi Pico 2W and a 1.3-inch LCD. Combines USB playback controls with Wi-Fi volume control, a now-playing display, and a look at what’s next in the queue.",
    technologies: ["CircuitPython", "Raspberry Pi Pico 2W", "Spotify Web API", "USB HID"],
    details: ["Implemented CircuitPython firmware with OAuth 2.0 token refresh, NTP time synchronization, an SPI display driver, and joystick and tactile-button input handling."],
    github: "https://github.com/loganpetrock/SpotifyMediaController",
    demo: "",
    image: "",
    imageAlt: "",
  },
  {
    title: "Integrated Fishing Drone",
    id: "integrated-fishing-drone",
    date: "December 2025 – June 2026",
    summary: "FPV drone with a payload release system",
    description: "Engineered a 7-inch Betaflight FPV drone on a SpeedyBee F405 stack, tuned to deploy a payload of more than 2 pounds.",
    details: [
      "Developed a custom PWM-controlled release mechanism using a linear actuator to drop a fishing line.",
      "Used root cause analysis and system testing to diagnose board-level failures, including ESC power distribution shorts and USB-to-UART bridge communication issues.",
    ],
    technologies: ["Betaflight", "SpeedyBee F405", "PWM", "System Testing"],
    github: "",
    demo: "",
    image: "",
    imageAlt: "",
  },
  {
    title: "Camera Gear Detector",
    id: "camera-gear-detector",
    date: "December 2025",
    summary: "Real-time equipment recognition",
    description: "A real-time computer vision system that identifies equipment in my photography setup. Runs a YOLO11s model through ONNX Runtime and DirectML for inference accelerated by AMD GPUs.",
    technologies: ["Python", "YOLO11s", "ONNX Runtime", "DirectML"],
    github: "https://github.com/loganpetrock/CameraGearDetector",
    demo: "",
    image: "",
    imageAlt: "",
  }
];
