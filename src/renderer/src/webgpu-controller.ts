import { ConwaysController } from "./conway"

if (!navigator.gpu) {
  throw new Error("WebGPU is not supported");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found");
}

const device = await adapter.requestDevice();

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const startSimBtn = document.getElementById("startSimBtn");
const pauseSimBtn = document.getElementById("pauseSimBtn");
const resetSimBtn = document.getElementById("resetSimBtn");
const nextIterBtn = document.getElementById("nextIterBtn");
const iterationCounter = document.getElementById("counter_num") as HTMLParagraphElement;

const UPDATE_INTERVAL = 50; // ms
let simulation_timer: NodeJS.Timeout | null;

const conway = new ConwaysController(canvas, device);
conway.init();

const updateIterationCounter = () => {
  iterationCounter.textContent = `\xa0${conway.iterationNumber}`;
}

const updateSim = () => {
  conway.updateGrid();
  updateIterationCounter();
}

const startSimulation = () => {
  if (!simulation_timer)
    simulation_timer = setInterval(updateSim, UPDATE_INTERVAL);
}

const pauseSimulation = () => {
  if (simulation_timer) {
    clearInterval(simulation_timer);
    simulation_timer = null;
  }
}

const nextIteration = () => {
  updateSim();
}

const resetSimulation = () => {
  conway.resetGrid();
  updateIterationCounter();
}

startSimBtn?.addEventListener('click', startSimulation);
pauseSimBtn?.addEventListener('click', pauseSimulation);
resetSimBtn?.addEventListener('click', resetSimulation);
nextIterBtn?.addEventListener('click', nextIteration);
