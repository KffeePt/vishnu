const readline = require('readline');

console.log('--- Mouse Input Sniffer ---');
console.log('Press keys, move mouse, or click (Ctrl+C to exit)');
console.log('---------------------------');

// Enable SGR Mouse + Window Focus reporting
// \x1b[?1000h = Mouse Press/Release
// \x1b[?1006h = SGR Mode (required for reliable coordinate reporting)
// \x1b[?1015h = Urxvt Mode (often redundant but good for compat)
// \x1b[?1004h = Focus Reporting
process.stdout.write('\x1b[?1000h\x1b[?1006h\x1b[?1015h\x1b[?1004h');

if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();

process.stdin.on('data', (chunk) => {
    const hex = chunk.toString('hex');
    const str = JSON.stringify(chunk.toString());
    console.log(`INPUT -> Hex: ${hex} | String: ${str}`);

    // Exit on Ctrl+C (03)
    if (chunk.includes('\u0003')) {
        console.log('Exiting...');
        process.exit(0);
    }
});

// Cleanup on exit
process.on('exit', () => {
    // Disable everything
    process.stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?1015l\x1b[?1004l');
});
