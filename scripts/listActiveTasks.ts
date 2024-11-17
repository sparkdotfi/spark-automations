import * as dotenv from 'dotenv'
import * as fs from 'fs'
import { ethers } from 'ethers'
import { AutomateSDK } from '@gelatonetwork/automate-sdk'
;(async () => {
    dotenv.config()

    const mainnetRpcUrl = process.env.MAINNET_RPC_URL
    if (!mainnetRpcUrl) {
        console.error('Set a valid value for MAINNET_RPC_URL')
        process.exit(1)
    }

    const gnosisRpcUrl = process.env.GNOSIS_CHAIN_RPC_URL
    if (!gnosisRpcUrl) {
        console.error('Set a valid value for GNOSIS_CHAIN_RPC_URL')
        process.exit(1)
    }

    const baseRpcUrl = process.env.BASE_RPC_URL
    if (!baseRpcUrl) {
        console.error('Set a valid value for BASE_RPC_URL')
        process.exit(1)
    }

    const keystorePath = process.argv[2] || (process.env.GELATO_KEYSTORE_PATH as string)
    const passwordPath = process.argv[3] || (process.env.GELATO_PASSWORD_PATH as string)

    const password = passwordPath ? fs.readFileSync(passwordPath, 'utf8').slice(0, -1) : ''
    const keystore = fs.readFileSync(keystorePath, 'utf8')

    const deployer = ethers.Wallet.fromEncryptedJsonSync(keystore, password)
    const mainnetDeployer = new ethers.Wallet(deployer.privateKey, new ethers.providers.JsonRpcProvider(mainnetRpcUrl))
    const gnosisDeployer = new ethers.Wallet(deployer.privateKey, new ethers.providers.JsonRpcProvider(gnosisRpcUrl))
    const baseDeployer = new ethers.Wallet(deployer.privateKey, new ethers.providers.JsonRpcProvider(baseRpcUrl))

    const mainnetAutomation = new AutomateSDK(1, mainnetDeployer)
    const gnosisAutomation = new AutomateSDK(100, gnosisDeployer)
    const baseAutomation = new AutomateSDK(8453, baseDeployer)

    console.log('== All Mainnet active tasks ==')
    const mainnetTasks = await mainnetAutomation.getActiveTasks()
    mainnetTasks.forEach((task) => {
        console.log(`    * ${task.taskId} (${task.name})`)
    })

    console.log('== All Gnosis active tasks ==')
    const gnosisTasks = await gnosisAutomation.getActiveTasks()
    gnosisTasks.forEach((task) => {
        console.log(`    * ${task.taskId} (${task.name})`)
    })

    console.log('== All Base active tasks ==')
    const baseTasks = await baseAutomation.getActiveTasks()
    baseTasks.forEach((task) => {
        console.log(`    * ${task.taskId} (${task.name})`)
    })
})()
