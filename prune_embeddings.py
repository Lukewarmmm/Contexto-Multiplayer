import json

GLOVE_FILE = 'server/data/glove.6B.50d.txt'
NOUNS_FILE = 'server/data/nouns.txt'
OUTPUT_FILE = 'server/data/pruned_embeddings.json'

def load_nouns(path):
    with open(path, 'r', encoding='utf-8') as f:
        return {line.strip() for line in f if line.strip()}

def prune_embeddings(glove_path, nouns_set, output_path):
    pruned = {}
    with open(glove_path, 'r', encoding='utf-8') as gf:
        for line in gf:
            parts = line.strip().split()
            word = parts[0]
            if word in nouns_set:
                vector = list(map(float, parts[1:]))
                pruned[word] = vector
    with open(output_path, 'w', encoding='utf-8') as out:
        json.dump(pruned, out)
    print(f'Pruned embeddings saved to {output_path} ({len(pruned)} words)')

if __name__ == '__main__':
    nouns = load_nouns(NOUNS_FILE)
    prune_embeddings(GLOVE_FILE, nouns, OUTPUT_FILE)