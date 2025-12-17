
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', ['index.js'], {
    cwd: process.cwd(),
    stdio: 'inherit' // Inherit stdio so we see logs
});

server.on('error', (err) => {
    console.error('Failed to start server:', err);
});

console.log('Server process started, PID:', server.pid);

setTimeout(() => {
    console.log('Running send-tx.js...');
    const client = spawn('node', ['client-example/send-tx.js'], {
        cwd: process.cwd(),
        stdio: 'inherit'
    });

    client.on('close', (code) => {
        console.log(`Client process exited with code ${code}`);
        server.kill();
        process.exit(code);
    });
}, 30000); // Wait 30 seconds for server to start
