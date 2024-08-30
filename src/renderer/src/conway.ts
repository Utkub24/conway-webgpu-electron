/// <reference types="@webgpu/types" />

const GRID_SIZE = 128;
const WORKGROUP_SIZE = 8;

class ConwaysController {
  #device: GPUDevice;
  #canvas: HTMLCanvasElement;
  #context: GPUCanvasContext;
  #vertices = new Float32Array([
    //   X,    Y,
    -1.0, -1.0,
    1.0, 1.0,
    1.0, -1.0,

    -1.0, -1.0,
    1.0, 1.0,
    -1.0, 1.0,
  ]);
  #cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
  #step = 0;
  #pipelineLayout: GPUPipelineLayout;
  #bindGroupLayout: GPUBindGroupLayout;
  #cellPipeline: GPURenderPipeline;
  #simulationPipeline: GPUComputePipeline;
  #vertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    }],
  };
  #bindGroups: GPUBindGroup[];
  #vertexBuffer: GPUBuffer;
  #uniformBuffer: GPUBuffer;
  #cellStateStorage: GPUBuffer[];
  #cellShaderModule: GPUShaderModule;
  #simulationShaderModule: GPUShaderModule;
  #canvasFormat: GPUTextureFormat;

  constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.#canvas = canvas;
    this.#device = device;
    this.#context = canvas.getContext('webgpu') as GPUCanvasContext;
  }

  init() {
    this.#setupCanvas();
    this.#createBuffers();
    this.#createShaders();
    this.#createPipelineLayout();
    this.#createPipelines();
  }

  get iterationNumber() {
    return this.#step;
  }

  #setupCanvas() {
    const devicePixelRatio = window.devicePixelRatio;
    this.#canvas.width = this.#canvas.clientWidth * devicePixelRatio;
    this.#canvas.height = this.#canvas.clientHeight * devicePixelRatio;

    this.#canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.#context.configure({
      device: this.#device,
      format: this.#canvasFormat,
    });
  }

  #createBuffers() {
    this.#vertexBuffer = this.#device.createBuffer({
      label: "Cell vertices",
      size: this.#vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.#device.queue.writeBuffer(this.#vertexBuffer, /*bufferOffset=*/0, this.#vertices);

    // Create a uniform buffer that describes the grid.
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    this.#uniformBuffer = this.#device.createBuffer({
      label: "Grid Uniforms",
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, uniformArray);

    // Create two storage buffers to hold the cell state.
    this.#cellStateStorage = [
      this.#device.createBuffer({
        label: "Cell State A",
        size: this.#cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      this.#device.createBuffer({
        label: "Cell State B",
        size: this.#cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    ];

    this.resetCellStateArray();
  }

  #createPipelineLayout() {
    // Create the bind group layout and pipeline layout.
    this.#bindGroupLayout = this.#device.createBindGroupLayout({
      label: "Cell Bind Group Layout",
      entries: [{
        binding: 0,
        // Add GPUShaderStage.FRAGMENT here if you are using the `grid` uniform in the fragment shader.
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' } // Grid uniform buffer
      }, {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" } // Cell state input buffer
      }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" } // Cell state output buffer
      }]
    });

    this.#pipelineLayout = this.#device.createPipelineLayout({
      label: "Cell Pipeline Layout",
      bindGroupLayouts: [this.#bindGroupLayout],
    });

    // Create a bind group to pass the grid uniforms into the pipeline
    this.#bindGroups = [
      this.#device.createBindGroup({
        label: "Cell renderer bind group A",
        layout: this.#bindGroupLayout,
        entries: [{
          binding: 0,
          resource: { buffer: this.#uniformBuffer }
        }, {
          binding: 1,
          resource: { buffer: this.#cellStateStorage[0] }
        }, {
          binding: 2,
          resource: { buffer: this.#cellStateStorage[1] }
        }],
      }),

      this.#device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: this.#bindGroupLayout,

        entries: [{
          binding: 0,
          resource: { buffer: this.#uniformBuffer }
        }, {
          binding: 1,
          resource: { buffer: this.#cellStateStorage[1] }
        }, {
          binding: 2,
          resource: { buffer: this.#cellStateStorage[0] }
        }],
      }),
    ];
  }

  #createShaders() {
    this.#cellShaderModule = this.#device.createShaderModule({
      label: "Cell shader",
      code: `
  struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
  };

  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
  };

  @group(0) @binding(0) var<uniform> grid: vec2f;
  @group(0) @binding(1) var<storage> cellState: array<u32>;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput  {
    let i = f32(input.instance);
    let cell = vec2f(i % grid.x, floor(i / grid.x));
    let state = f32(cellState[input.instance]);
    let cellOffset = cell / grid * 2;
    let gridPos = (state * input.pos + 1) / grid - 1 + cellOffset;

    var output: VertexOutput;
    output.pos = vec4f(gridPos, 0, 1);
    output.cell = cell; // New line!
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let c = input.cell / grid;
    return vec4f(1 - c.x, c, 1);
  }
  `
    });

    this.#simulationShaderModule = this.#device.createShaderModule({
      label: "Game of Life simulation shader",
      code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    fn cellIndex(cell: vec2u) -> u32 {
    return (cell.y % u32(grid.y)) * u32(grid.x) +
           (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cellIndex(vec2(x, y))];
    }

    @compute
    @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                            cellActive(cell.x+1, cell.y) +
                            cellActive(cell.x+1, cell.y-1) +
                            cellActive(cell.x, cell.y-1) +
                            cellActive(cell.x-1, cell.y-1) +
                            cellActive(cell.x-1, cell.y) +
                            cellActive(cell.x-1, cell.y+1) +
                            cellActive(cell.x, cell.y+1);

      let i = cellIndex(cell.xy);

      switch activeNeighbors {
        case 2: { // stay active
          cellStateOut[i] = cellStateIn[i];
        }
        case 3: { // become alive
          cellStateOut[i] = 1;
        }
        default: { // die
          cellStateOut[i] = 0;
        }
      }
    }`
    });
  }

  #createPipelines() {
    this.#cellPipeline = this.#device.createRenderPipeline({
      label: "Cell pipeline",
      layout: this.#pipelineLayout,
      vertex: {
        module: this.#cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [this.#vertexBufferLayout]
      },
      fragment: {
        module: this.#cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
          format: this.#canvasFormat
        }]
      }
    });

    // Create a compute pipeline that updates the game state.
    this.#simulationPipeline = this.#device.createComputePipeline({
      label: "Simulation pipeline",
      layout: this.#pipelineLayout,
      compute: {
        module: this.#simulationShaderModule,
        entryPoint: "computeMain",
      }
    });
  }

  computeNextIteration() {
    const encoder = this.#device.createCommandEncoder();

    const computePass = encoder.beginComputePass();

    computePass.setPipeline(this.#simulationPipeline);
    computePass.setBindGroup(0, this.#bindGroups[this.#step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    const commandBuffer = encoder.finish();

    this.#device.queue.submit([commandBuffer]);

    this.#step++;
  }

  drawGrid() {
    const encoder = this.#device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.#context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }]
    });


    pass.setPipeline(this.#cellPipeline);
    pass.setBindGroup(0, this.#bindGroups[this.#step % 2]);
    pass.setVertexBuffer(0, this.#vertexBuffer);
    pass.draw(this.#vertices.length / 2, GRID_SIZE * GRID_SIZE);

    pass.end();

    const commandBuffer = encoder.finish();

    this.#device.queue.submit([commandBuffer]);
  }

  updateGrid() {
    this.computeNextIteration();
    this.drawGrid();
  }

  resetGrid() {
    this.resetCellStateArray();
    this.#step = 0;
    this.drawGrid();
  }

  resetCellStateArray() {
    for (let i = 0; i < this.#cellStateArray.length; i++) {
      this.#cellStateArray[i] = Math.random() > 0.9 ? 1 : 0;
    }
    this.#device.queue.writeBuffer(this.#cellStateStorage[0], 0, this.#cellStateArray);
  }
}

export { ConwaysController }
