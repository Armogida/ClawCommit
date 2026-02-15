// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ClawCommitBatch
 * @notice Wave 1 Merkle batching for deterministic AI decision commitments.
 */
contract ClawCommitBatch {
    error ZeroRoot();
    error InvalidLeafCount();
    error OnlyBatchCommitter();
    error LeafAlreadyRevealed();
    error LeafIndexOutOfRange();
    error LeafHashMismatch();
    error ProofLengthMismatch();

    struct BatchCommitment {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 timestamp;
        address committer;
        string modelVersion;
        bytes32 manifestHash;
    }

    struct RevealedLeaf {
        bytes32 leafHash;
        string prompt;
        string output;
        string nonce;
        uint256 leafIndex;
        bool revealed;
    }

    struct MerkleProofData {
        bytes32[] siblings;
        bool[] path;
    }

    struct LeafRevealData {
        uint256 leafIndex;
        string prompt;
        string output;
        string nonce;
    }

    uint256 public batchCount;
    mapping(uint256 => BatchCommitment) public batches;
    mapping(uint256 => mapping(uint256 => RevealedLeaf)) public revealedLeaves;

    event BatchCommitted(
        uint256 indexed batchId,
        address indexed committer,
        bytes32 merkleRoot,
        uint32 leafCount,
        string modelVersion,
        bytes32 manifestHash,
        uint64 timestamp
    );

    event BatchLeafRevealed(
        uint256 indexed batchId,
        uint256 indexed leafIndex,
        bytes32 leafHash,
        address indexed revealer,
        string prompt,
        string output
    );

    function _computeRootFromProof(
        bytes32 leafHash,
        bytes32[] calldata siblings,
        bool[] calldata path
    ) internal pure returns (bytes32 computed) {
        computed = leafHash;
        for (uint256 i = 0; i < siblings.length; i++) {
            if (path[i]) {
                computed = keccak256(abi.encode(siblings[i], computed));
            } else {
                computed = keccak256(abi.encode(computed, siblings[i]));
            }
        }
    }

    function commitBatch(
        bytes32 merkleRoot,
        uint32 leafCount,
        string calldata modelVersion,
        bytes32 manifestHash
    ) external returns (uint256 batchId) {
        if (merkleRoot == bytes32(0)) revert ZeroRoot();
        if (leafCount == 0) revert InvalidLeafCount();

        batchId = batchCount;
        batches[batchId] = BatchCommitment({
            merkleRoot: merkleRoot,
            leafCount: leafCount,
            timestamp: uint64(block.timestamp),
            committer: msg.sender,
            modelVersion: modelVersion,
            manifestHash: manifestHash
        });

        batchCount++;

        emit BatchCommitted(
            batchId,
            msg.sender,
            merkleRoot,
            leafCount,
            modelVersion,
            manifestHash,
            uint64(block.timestamp)
        );
    }

    function getBatch(
        uint256 batchId
    ) external view returns (BatchCommitment memory) {
        return batches[batchId];
    }

    function computeLeafHash(
        string calldata prompt,
        string calldata output,
        string calldata modelVersion,
        string calldata nonce,
        uint256 leafIndex
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(prompt, output, modelVersion, nonce, leafIndex));
    }

    function revealBatchLeaf(
        uint256 batchId,
        LeafRevealData calldata reveal,
        MerkleProofData calldata proof
    ) external {
        BatchCommitment storage batch = batches[batchId];
        if (batch.committer != msg.sender) revert OnlyBatchCommitter();
        if (reveal.leafIndex >= batch.leafCount) revert LeafIndexOutOfRange();
        if (revealedLeaves[batchId][reveal.leafIndex].revealed) revert LeafAlreadyRevealed();
        if (proof.siblings.length != proof.path.length) revert ProofLengthMismatch();

        string memory modelVersion = batch.modelVersion;
        bytes32 merkleRoot = batch.merkleRoot;
        bytes32 leafHash = keccak256(
            abi.encode(
                reveal.prompt,
                reveal.output,
                modelVersion,
                reveal.nonce,
                reveal.leafIndex
            )
        );
        bytes32 computed = _computeRootFromProof(
            leafHash,
            proof.siblings,
            proof.path
        );
        if (computed != merkleRoot) revert LeafHashMismatch();

        RevealedLeaf storage revealed = revealedLeaves[batchId][reveal.leafIndex];
        revealed.leafHash = leafHash;
        revealed.prompt = reveal.prompt;
        revealed.output = reveal.output;
        revealed.nonce = reveal.nonce;
        revealed.leafIndex = reveal.leafIndex;
        revealed.revealed = true;

        emit BatchLeafRevealed(
            batchId,
            reveal.leafIndex,
            leafHash,
            msg.sender,
            reveal.prompt,
            reveal.output
        );
    }

    function getRevealedLeaf(uint256 batchId, uint256 leafIndex) external view returns (RevealedLeaf memory) {
        return revealedLeaves[batchId][leafIndex];
    }

    function verifyBatchInclusion(
        uint256 batchId,
        bytes32 leafHash,
        bytes32[] calldata siblings,
        bool[] calldata path
    ) external view returns (bool) {
        if (siblings.length != path.length) revert ProofLengthMismatch();
        bytes32 computed = _computeRootFromProof(leafHash, siblings, path);
        return computed == batches[batchId].merkleRoot;
    }
}
