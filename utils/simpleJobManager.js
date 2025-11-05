// ==================== FILE: backend/utils/simpleJobManager.js (UPDATED) ====================
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class JobManager {
  constructor() {
    this.currentJobId = null;
    this.currentProcess = null;
    this.jobData = null;
    this.startTime = null;
    this.output = '';
    this.killTimeout = null; // Track kill timeout
    this.isKilling = false; // Track if we're in process of killing
  }

  // Check if a job is running (improved)
  isJobRunning() {
    if (!this.currentProcess) return false;
    
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(this.currentProcess.pid, 0);
      return true;
    } catch (err) {
      // Process doesn't exist
      this.cleanup();
      return false;
    }
  }

  // Cleanup helper
  cleanup() {
    if (this.killTimeout) {
      clearTimeout(this.killTimeout);
      this.killTimeout = null;
    }
    this.currentJobId = null;
    this.currentProcess = null;
    this.jobData = null;
    this.startTime = null;
    this.output = '';
    this.isKilling = false;
  }

  // Start a new job
  async startJob(scriptName, params = {}) {
    // Check if another job is running
    if (this.isJobRunning()) {
      throw new Error('Another job is already running. Please wait or cancel it first.');
    }

    const jobId = `${scriptName}-${Date.now()}`;
    const scriptPath = path.join(__dirname, '../', scriptName);

    return new Promise((resolve, reject) => {
      try {
        console.log(`🚀 Starting job: ${jobId}`);
        console.log(`📄 Script: ${scriptPath}`);

        const jobEnv = {
          ...process.env,
          ...params,
          USE_PROXY: process.env.USE_PROXY || 'false',
          PROXY_SERVER: process.env.PROXY_SERVER || ''
        };

        const child = spawn('node', [scriptPath], {
          env: jobEnv,
          cwd: path.join(__dirname, '../'),
          stdio: ['ignore', 'pipe', 'pipe'] // Ignore stdin
        });

        // Store job details
        this.currentJobId = jobId;
        this.currentProcess = child;
        this.jobData = { scriptName, params };
        this.startTime = Date.now();
        this.output = '';
        this.isKilling = false;

        console.log(`✅ Job spawned with PID: ${child.pid}`);

        // Handle stdout
        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          this.output += chunk;
          console.log(`[${jobId}] ${chunk}`);
        });

        // Handle stderr
        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          console.error(`[${jobId}] ERROR: ${chunk}`);
        });

        // Handle process close
        child.on('close', (code) => {
          console.log(`✅ Job ${jobId} finished with code: ${code}`);
          this.cleanup();
        });

        // Handle process error
        child.on('error', (error) => {
          console.error(`❌ Job ${jobId} error:`, error.message);
          this.cleanup();
        });

        // Handle process exit
        child.on('exit', (code, signal) => {
          console.log(`Process exited: ${jobId} | Code: ${code} | Signal: ${signal}`);
          this.cleanup();
        });

        // Return job info immediately
        resolve({
          jobId,
          status: 'started',
          message: `Job started: ${scriptName}`,
          pid: child.pid
        });

      } catch (error) {
        console.error(`❌ Error spawning job: ${error.message}`);
        this.cleanup();
        reject(error);
      }
    });
  }

  // Cancel current job (improved)
  cancelJob() {
    if (!this.isJobRunning()) {
      return {
        success: false,
        message: 'No job is currently running',
        isRunning: false
      };
    }

    if (this.isKilling) {
      return {
        success: false,
        message: 'Job cancellation already in progress',
        isRunning: true
      };
    }

    const jobId = this.currentJobId;
    const pid = this.currentProcess.pid;

    console.log(`🛑 Cancelling job: ${jobId} (PID: ${pid})`);
    this.isKilling = true;

    try {
      // Step 1: Send SIGTERM (graceful shutdown)
      console.log(`📌 Sending SIGTERM to process ${pid}...`);
      process.kill(pid, 'SIGTERM');

      // Step 2: Wait 3 seconds, then SIGKILL if still running
      this.killTimeout = setTimeout(() => {
        console.log(`⏱️ SIGTERM timeout, sending SIGKILL to ${pid}...`);
        try {
          if (this.currentProcess && this.isJobRunning()) {
            process.kill(pid, 'SIGKILL');
            console.log(`💥 SIGKILL sent to ${pid}`);
          }
        } catch (err) {
          console.error(`Error sending SIGKILL: ${err.message}`);
        }
      }, 3000);

      // Step 3: Listen for exit event to clear timeout
      const exitHandler = () => {
        if (this.killTimeout) {
          clearTimeout(this.killTimeout);
          this.killTimeout = null;
        }
      };

      this.currentProcess.once('exit', exitHandler);
      this.currentProcess.once('close', exitHandler);

      const cancelledJobId = this.currentJobId;
      const cancelledPid = pid;

      // Don't cleanup immediately, let the process handle it
      // Just mark as killing
      console.log(`✅ Cancellation initiated for ${cancelledJobId}`);

      return {
        success: true,
        message: `Job cancellation initiated: ${cancelledJobId}`,
        pid: cancelledPid,
        cancelledJob: cancelledJobId
      };

    } catch (error) {
      console.error(`❌ Error cancelling job: ${error.message}`);
      this.isKilling = false;
      return {
        success: false,
        message: `Error cancelling job: ${error.message}`,
        isRunning: true
      };
    }
  }

  // Force kill (emergency)
  forceKillJob() {
    if (!this.currentProcess || !this.isJobRunning()) {
      return {
        success: false,
        message: 'No process to kill'
      };
    }

    const pid = this.currentProcess.pid;
    console.log(`💥 Force killing process ${pid}...`);

    try {
      // Send SIGKILL immediately
      process.kill(pid, 'SIGKILL');
      console.log(`✅ SIGKILL sent to ${pid}`);

      // Clear timeout if exists
      if (this.killTimeout) {
        clearTimeout(this.killTimeout);
        this.killTimeout = null;
      }

      this.cleanup();

      return {
        success: true,
        message: 'Process force killed',
        pid
      };
    } catch (error) {
      console.error(`❌ Error force killing: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }

  // Get current job status (improved)
  getStatus() {
    if (!this.isJobRunning()) {
      return {
        isRunning: false,
        message: 'No job is currently running',
        script: null,
        pid: null,
        status: 'idle'
      };
    }

    const uptime = Math.round((Date.now() - this.startTime) / 1000);

    return {
      isRunning: true,
      jobId: this.currentJobId,
      script: this.jobData?.scriptName || 'unknown',
      pid: this.currentProcess?.pid || null,
      uptime: uptime,
      startTime: new Date(this.startTime).toISOString(),
      status: this.isKilling ? 'killing' : 'running',
      message: this.isKilling 
        ? `Killing job (${uptime}s elapsed)` 
        : `Job running (${uptime}s elapsed)`,
      outputLength: this.output.length
    };
  }

  // Get job output
  getOutput() {
    return this.output;
  }

  // Clear output
  clearOutput() {
    this.output = '';
  }
}

// Export singleton instance
export default new JobManager();
