const path = require('path');

// Synchronously load your pruned embeddings JSON
const embeddings = require(path.join(__dirname, 'data', 'pruned_embeddings.json'));

// Synchronously loads your noun list into an Array of strings
const fs = require('fs');
function loadNouns(fileName) {
    const filePath = path.join(__dirname, 'data', fileName);
    return fs
        .readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean);
}

function loadEmbeddings() {
    // No need for async text parsing—just return the precomputed JSON
    return embeddings;
}

module.exports = { loadEmbeddings, loadNouns };