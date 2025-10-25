module.exports = {
    apps: [{
        name: 'faqture-back',
        script: 'src/index.js',
        node_args: '--max-old-space-size=2048',
        watch: false,
        // instances: 1,
        exec_mode: 'fork',
        kill_timeout: 5000,      // Dar 5 segundos para shutdown
        wait_ready: false,
        listen_timeout: 3000,
        shutdown_with_message: true  // Habilitar mensajes de shutdown
    }]
}