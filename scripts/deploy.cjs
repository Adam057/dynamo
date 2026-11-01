const {ethers,network}=require('hardhat');

async function main(){
  if(network.name!=='bsc'||network.config.chainId!==56)throw new Error('Deployment requires the configured BSC mainnet network (chain ID 56).');
  const actual=(await ethers.provider.getNetwork()).chainId;
  if(actual!==56n)throw new Error(`RPC reports chain ID ${actual}, expected 56. No transaction sent.`);
  if(!process.env.DEPLOYER_PRIVATE_KEY)throw new Error('DEPLOYER_PRIVATE_KEY is not configured locally. No transaction sent.');
  const [deployer]=await ethers.getSigners();
  const factory=await ethers.getContractFactory('DiscoveryRegistry');
  const gas=await deployer.estimateGas(await factory.getDeployTransaction());
  const gasPrice=(await ethers.provider.getFeeData()).gasPrice;
  if(!gasPrice)throw new Error('RPC did not return a gas price. No transaction sent.');
  const balance=await ethers.provider.getBalance(deployer.address);
  const estimatedCost=gas*gasPrice;
  console.log('Network:',network.name,'chain ID:',actual.toString());
  console.log('Deployer:',deployer.address);
  console.log('Balance:',ethers.formatEther(balance),'BNB');
  console.log('Estimated gas:',gas.toString());
  console.log('Gas price:',ethers.formatUnits(gasPrice,'gwei'),'gwei');
  console.log('Estimated cost:',ethers.formatEther(estimatedCost),'BNB (gas estimate × gas price)');
  if(balance<estimatedCost*12n/10n)throw new Error('Deployer balance is below the estimated cost plus a 20% buffer. No transaction sent.');
  if(process.env.CONFIRM_MAINNET_DEPLOY!=='YES'){
    console.log('Dry run complete. No transaction sent.');
    return;
  }
  const contract=await factory.deploy();
  console.log('Transaction:',contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  console.log('Contract:',await contract.getAddress());
}

main().catch(error=>{console.error(error);process.exitCode=1});
