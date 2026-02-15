// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReplayMismatchMock {
    struct Commitment {
        bytes32 hash;
        uint256 timestamp;
        address committer;
        bool revealed;
        string prompt;
        string output;
        string modelVersion;
        string nonce;
    }

    Commitment private commitment;

    function revealDecision(
        uint256,
        string calldata prompt,
        string calldata output,
        string calldata modelVersion,
        string calldata nonce
    ) external {
        commitment = Commitment({
            hash: bytes32(uint256(1)),
            timestamp: block.timestamp,
            committer: msg.sender,
            revealed: true,
            prompt: prompt,
            output: output,
            modelVersion: modelVersion,
            nonce: nonce
        });
    }

    function getCommitment(uint256) external view returns (Commitment memory) {
        return commitment;
    }
}
