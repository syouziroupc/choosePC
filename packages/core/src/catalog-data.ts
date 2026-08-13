import intelCore2Desktop from "../../../knowledge/hardware/cpu/intel-core2-desktop.json";
import intelCore2Quad from "../../../knowledge/hardware/cpu/intel-core2-quad.json";
import intelPre4 from "../../../knowledge/hardware/cpu/intel-legacy-1st-3rd-representative.json";
import intelLegacy from "../../../knowledge/hardware/cpu/intel-legacy-4th-7th.json";
import intelLowPower from "../../../knowledge/hardware/cpu/intel-low-power.json";
import intelMobile from "../../../knowledge/hardware/cpu/intel-mobile.json";
import intelDesktop from "../../../knowledge/hardware/cpu/intel-desktop.json";
import intelUltra from "../../../knowledge/hardware/cpu/intel-core-ultra.json";
import current2026 from "../../../knowledge/hardware/cpu/current-2026.json";
import amdLegacy from "../../../knowledge/hardware/cpu/amd-phenom-fx.json";
import amdMobile from "../../../knowledge/hardware/cpu/amd-mobile.json";
import amdDesktop from "../../../knowledge/hardware/cpu/amd-desktop.json";
import apple from "../../../knowledge/hardware/cpu/apple-silicon.json";
import workstationCpu from "../../../knowledge/hardware/cpu/workstation.json";
import integrated from "../../../knowledge/hardware/gpu/integrated.json";
import integrated2026 from "../../../knowledge/hardware/gpu/integrated-2026.json";
import nvidiaDesktop from "../../../knowledge/hardware/gpu/nvidia-desktop.json";
import nvidiaLaptop from "../../../knowledge/hardware/gpu/nvidia-laptop.json";
import nvidiaMainstreamLaptop from "../../../knowledge/hardware/gpu/nvidia-mainstream-laptop.json";
import amdRadeon from "../../../knowledge/hardware/gpu/amd-radeon.json";
import amdRadeonLaptop from "../../../knowledge/hardware/gpu/amd-radeon-laptop.json";
import intelArc from "../../../knowledge/hardware/gpu/intel-arc.json";
import workstationGpu from "../../../knowledge/hardware/gpu/workstation.json";

export const CPU_CATALOG_DATA = [
  ...intelCore2Desktop, ...intelCore2Quad, ...intelPre4, ...intelLegacy, ...intelLowPower,
  ...intelMobile, ...intelDesktop, ...intelUltra, ...current2026, ...amdLegacy,
  ...amdMobile, ...amdDesktop, ...apple, ...workstationCpu,
];

export const GPU_CATALOG_DATA = [
  ...integrated, ...integrated2026, ...nvidiaMainstreamLaptop, ...nvidiaDesktop,
  ...nvidiaLaptop, ...amdRadeon, ...amdRadeonLaptop, ...intelArc, ...workstationGpu,
];
