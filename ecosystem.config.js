module.exports = {
    apps: [{
        name: 'faqture-back',
        script: 'src/index.js',
        node_args: '--max-old-space-size=2048',
        watch: false,
    }]
}