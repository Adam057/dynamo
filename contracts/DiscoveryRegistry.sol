// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DiscoveryRegistry {
    error EmptyCommitment();
    error UnknownDiscovery();
    struct Discovery { address creator; bytes32 modelHash; bytes32 datasetHash; bytes32 metadataHash; uint64 timestamp; uint64 parentId; uint64 verificationCount; }
    uint256 private count;
    mapping(uint256 => Discovery) private discoveries;
    event DiscoveryRegistered(uint256 indexed id, address indexed creator, uint256 indexed parentId, bytes32 modelHash);
    event VerificationSubmitted(uint256 indexed id, address indexed verifier, bytes32 reportHash);
    function registerDiscovery(bytes32 modelHash, bytes32 datasetHash, bytes32 metadataHash) external returns (uint256) { return _register(modelHash,datasetHash,metadataHash,0); }
    function registerImprovement(uint256 parentId, bytes32 modelHash, bytes32 datasetHash, bytes32 metadataHash) external returns (uint256) { if(parentId==0||parentId>count)revert UnknownDiscovery();return _register(modelHash,datasetHash,metadataHash,parentId); }
    function _register(bytes32 modelHash, bytes32 datasetHash, bytes32 metadataHash, uint256 parentId) internal returns(uint256 id) { if(modelHash==0||datasetHash==0||metadataHash==0)revert EmptyCommitment(); id=++count; discoveries[id]=Discovery(msg.sender,modelHash,datasetHash,metadataHash,uint64(block.timestamp),uint64(parentId),0);emit DiscoveryRegistered(id,msg.sender,parentId,modelHash); }
    function submitVerification(uint256 id, bytes32 reportHash) external { if(id==0||id>count)revert UnknownDiscovery();if(reportHash==0)revert EmptyCommitment();discoveries[id].verificationCount++;emit VerificationSubmitted(id,msg.sender,reportHash); }
    function getDiscovery(uint256 id) external view returns(Discovery memory) { if(id==0||id>count)revert UnknownDiscovery();return discoveries[id]; }
    function getDiscoveryCount() external view returns(uint256) { return count; }
}
