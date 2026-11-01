require('@nomicfoundation/hardhat-toolbox');
const {subtask}=require('hardhat/config');
const {TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD}=require('hardhat/builtin-tasks/task-names');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async({solcVersion},_,runSuper)=>{if(solcVersion==='0.8.26')return {compilerPath:require.resolve('solc/soljson.js'),isSolcJs:true,version:'0.8.26',longVersion:require('solc').version()};return runSuper()});
module.exports={solidity:{version:'0.8.26',settings:{optimizer:{enabled:true,runs:200}}},networks:{bsc:{url:process.env.BSC_RPC_URL||'https://bsc-dataseed.binance.org',chainId:56,accounts:process.env.DEPLOYER_PRIVATE_KEY?[process.env.DEPLOYER_PRIVATE_KEY]:[]}}};
