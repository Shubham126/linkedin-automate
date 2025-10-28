import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store current job
let currentJob = null;

class JobManager {
  constructor() {
    this.currentJobId = null;
    this.currentProcess = null;
    this.jobData = null;
    this.startTime = null;
    this.output = '';
  }

  // Check if a job is running
  isJobRunning() {
    return this.currentProcess !== null;
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
      console.log(`🚀 Starting job: ${jobId}`);
      console.log(`📄 Script: ${scriptPath}`);

      const child = spawn('node', [scriptPath], {
        env: { ...process.env, ...params },
        cwd: path.join(__dirname, '../')
      });

      // Store job details
      this.currentJobId = jobId;
      this.currentProcess = child;
      this.jobData = { scriptName, params };
      this.startTime = Date.now();
      this.output = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        this.output += chunk;
        console.log(`[${jobId}] ${chunk}`);
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.error(`[${jobId}] ERROR: ${chunk}`);
      });

      child.on('close', (code) => {
        console.log(`Job ${jobId} finished with code: ${code}`);
        
        // Clear current job
        this.currentJobId = null;
        this.currentProcess = null;
        this.jobData = null;
        this.startTime = null;
      });

      child.on('error', (error) => {
        console.error(`Job ${jobId} error:`, error);
        this.currentJobId = null;
        this.currentProcess = null;
        this.jobData = null;
        this.startTime = null;
      });

      // Return job info immediately
      resolve({
        jobId,
        status: 'started',
        message: `Job started: ${scriptName}`
      });
    });
  }

  // Cancel current job
  cancelJob() {
    if (!this.isJobRunning()) {
      throw new Error('No job is currently running');
    }

    const jobId = this.currentJobId;
    console.log(`🛑 Cancelling job: ${jobId}`);

    try {
      // Kill the process
      this.currentProcess.kill('SIGTERM');

      // Give it a moment, then force kill if needed
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 5000);

      // Clear job details
      const cancelledJobId = this.currentJobId;
      this.currentJobId = null;
      this.currentProcess = null;
      this.jobData = null;
      this.startTime = null;
      this.output = '';

      return {
        success: true,
        message: `Job ${cancelledJobId} cancelled successfully`
      };
    } catch (error) {
      console.error('Error cancelling job:', error);
      throw new Error('Failed to cancel job');
    }
  }

  // Get current job status
  getStatus() {
    if (!this.isJobRunning()) {
      return {
        isRunning: false,
        message: 'No job is currently running'
      };
    }

    return {
      isRunning: true,
      jobId: this.currentJobId,
      scriptName: this.jobData.scriptName,
      params: this.jobData.params,
      startTime: this.startTime,
      runningFor: Date.now() - this.startTime,
      outputLength: this.output.length
    };
  }
}

// Export singleton instance
export default new JobManager();
