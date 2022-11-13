const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("./getWeth")

async function main() {
    await getWeth()
    const { deployer } = await getNamedAccounts()
    // AAVE contract interaction
    //abi, address
    // lending pool addres provider : 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // lending pool abi :
    const lendingPool = await getLendingPool(deployer)
    console.log(`Lending pool address : ${lendingPool.address}`)

    //deposit -> means lending pool transfers token from our wallet to contract.
    // So to do this, first we need approve our token amount then only lending pool cal call safeTransferfrom
    //comment approveErC20() function line to see the error
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    //approve
    await approveERC20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited...")

    //borrow
    //we must know -> how much we have borrwed, how much in collateral, how much we can borrow
    //if we want to borrow Dai -> what's the conversion rate on DAI vs availableBorrowsETH
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
    const daiPrice = await getDaiPrice()
    //0.95 -> 95% of total aavailable ETH -> just to avoid borrowing 100% of available ETH. This is not fixed, canbe anything
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
    console.log(`You can borrow : ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())
    const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)

    //check user data again
    await getBorrowUserData(lendingPool, deployer)
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
    //approve -> sending dai back to the contract
    await approveERC20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("repayed!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account)
    await borrowTx.wait(1)
    console.log(`You've borrowed!.`)
}
async function getDaiPrice() {
    const daiEthProceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4" //dont need signer as we are reading
    )
    const price = (await daiEthProceFeed.latestRoundData())[1]
    console.log(`The DAI/ETH price is : ${price.toString()}`)
    return price
}

async function getBorrowUserData(lendingPool, account) {
    const {
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
    } = await lendingPool.getUserAccountData(account)

    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`)
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`)
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`)

    return { availableBorrowsETH, totalDebtETH }
}

async function approveERC20(contractAdd, spenderAdd, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", contractAdd, account)

    const tx = await erc20Token.approve(spenderAdd, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

async function getLendingPool(account) {
    const LendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    )
    const lendingPoolAddress = await LendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.log(error)
        process.exit(1)
    })
