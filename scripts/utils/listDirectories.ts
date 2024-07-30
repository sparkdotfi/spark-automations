import fs from 'fs'
import path from 'path'

export const listDirectories = (srcPath: string): string[] => {
    return fs.readdirSync(srcPath).filter((file) => fs.statSync(path.join(srcPath, file)).isDirectory())
}
