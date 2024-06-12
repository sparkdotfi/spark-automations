import * as fs from 'fs'
import { ethers } from "ethers"

console.log('== Testing access to the deployer key ==')

const keystorePath = process.argv[2]
const passwordPath = process.argv[3]

console.log('   * Keystore path:', keystorePath)
console.log('   * Password path:', passwordPath || 'No password path provided')

const keystore = JSON.parse(fs.readFileSync(keystorePath,'utf8'))
const password = passwordPath ? fs.readFileSync(passwordPath,'utf8') : ''

console.log(ethers.utils.HDNode)
