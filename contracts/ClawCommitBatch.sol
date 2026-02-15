// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ClawCommitBatch
 * @notice Wave 1 Merkle batching for deterministic AI decision commitments.
 */
contract ClawCommitBatch {
    error ZeroRoot();
    error InvalidLeafCount();

    struct BatchCommitment {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 timestamp;
        address committer;
        string modelVersion;
        bytes32 manifestHash;
    }

    uint256 public batchCount;
    mapping(uint256 => BatchCommitment) public batches;

    event BatchCommitted(
        uint256 indexed batchId,
        address indexed committer,
        bytes32 merkleRoot,
        uint32 leafCount,
        string modelVersion,
        bytes32 manifestHash,
        uint64 timestamp
    );

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
}
