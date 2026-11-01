const {expect}=require('chai');
const {ethers}=require('hardhat');

describe('DiscoveryRegistry',function(){
  async function setup(){
    const [creator,other]=await ethers.getSigners();
    const registry=await (await ethers.getContractFactory('DiscoveryRegistry')).deploy();
    const model=ethers.keccak256(ethers.toUtf8Bytes('model'));
    const dataset=ethers.keccak256(ethers.toUtf8Bytes('dataset'));
    const metadata=ethers.keccak256(ethers.toUtf8Bytes('metadata'));
    return {creator,other,registry,model,dataset,metadata};
  }

  it('registers a discovery with complete commitments and emits its event',async function(){
    const {creator,registry,model,dataset,metadata}=await setup();
    expect(await registry.getDiscoveryCount()).to.equal(0);
    await expect(registry.registerDiscovery(model,dataset,metadata))
      .to.emit(registry,'DiscoveryRegistered').withArgs(1,creator.address,0,model);
    const record=await registry.getDiscovery(1);
    expect(record.creator).to.equal(creator.address);
    expect(record.modelHash).to.equal(model);
    expect(record.datasetHash).to.equal(dataset);
    expect(record.metadataHash).to.equal(metadata);
    expect(record.timestamp).to.be.greaterThan(0);
    expect(record.parentId).to.equal(0);
    expect(record.verificationCount).to.equal(0);
    expect(await registry.getDiscoveryCount()).to.equal(1);
  });

  it('links improvements and accepts records from different users',async function(){
    const {other,registry,model,dataset,metadata}=await setup();
    await registry.registerDiscovery(model,dataset,metadata);
    await expect(registry.connect(other).registerImprovement(1,model,dataset,metadata))
      .to.emit(registry,'DiscoveryRegistered').withArgs(2,other.address,1,model);
    expect((await registry.getDiscovery(2)).parentId).to.equal(1);
    expect((await registry.getDiscovery(2)).creator).to.equal(other.address);
    expect(await registry.getDiscoveryCount()).to.equal(2);
  });

  it('records verification submissions and rejects invalid references or hashes',async function(){
    const {other,registry,model,dataset,metadata}=await setup();
    await registry.registerDiscovery(model,dataset,metadata);
    await expect(registry.connect(other).submitVerification(1,metadata))
      .to.emit(registry,'VerificationSubmitted').withArgs(1,other.address,metadata);
    expect((await registry.getDiscovery(1)).verificationCount).to.equal(1);
    for(const id of [0,2]){
      await expect(registry.submitVerification(id,metadata)).to.be.revertedWithCustomError(registry,'UnknownDiscovery');
      await expect(registry.getDiscovery(id)).to.be.revertedWithCustomError(registry,'UnknownDiscovery');
      await expect(registry.registerImprovement(id,model,dataset,metadata)).to.be.revertedWithCustomError(registry,'UnknownDiscovery');
    }
    await expect(registry.submitVerification(1,ethers.ZeroHash)).to.be.revertedWithCustomError(registry,'EmptyCommitment');
    for(const hashes of [[ethers.ZeroHash,dataset,metadata],[model,ethers.ZeroHash,metadata],[model,dataset,ethers.ZeroHash]])
      await expect(registry.registerDiscovery(...hashes)).to.be.revertedWithCustomError(registry,'EmptyCommitment');
    expect(await registry.getDiscoveryCount()).to.equal(1);
  });

  it('estimates deployment and registration gas on local Hardhat',async function(){
    const factory=await ethers.getContractFactory('DiscoveryRegistry');
    const deployment=await ethers.provider.estimateGas(await factory.getDeployTransaction());
    const registry=await factory.deploy();
    const hash=ethers.keccak256(ethers.toUtf8Bytes('model'));
    const registration=await registry.registerDiscovery.estimateGas(hash,hash,hash);
    expect(deployment).to.be.greaterThan(0);
    expect(registration).to.be.greaterThan(0);
    console.log(`      deployment ${deployment} gas; registration ${registration} gas (local estimate)`);
  });
});
