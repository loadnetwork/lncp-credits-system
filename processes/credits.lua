-- Imports
local json = require("json")

-- Global variables
if Name ~= "lncp-credits-system-ao" then
    Name = "lncp-credits-system-ao"
end
if Admin ~= "6vs8jt69nO8wSBQP7YzvV4QWs5WjtJPBWPIpC_mU7DM" then
    Admin = "6vs8jt69nO8wSBQP7YzvV4QWs5WjtJPBWPIpC_mU7DM"
end
if PaymentTokenId ~= "0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc" then
    PaymentTokenId = "0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc"
end
if PaymentTokenTicker ~= "AO" then
    PaymentTokenTicker = "AO"
end
if PaymentTokenDenomination ~= 12 then
    PaymentTokenDenomination = 12
end
if not PaymentTokenUsdPrice then
    PaymentTokenUsdPrice = 0
end
if not Credits then
    Credits = {}
end

-- Utils functions --

-- Arweave address validator
function is_valid_arweave_address(address)
    if type(address) ~= "string" then
        return false
    end
    
    if #address ~= 43 then
        return false
    end
    
    local pattern = "^[A-Za-z0-9_-]+$"
    return string.match(address, pattern) ~= nil
end

-- Ethereum address validator
function is_valid_ethereum_address(address)
    if type(address) ~= "string" then
        return false
    end
    
    if #address ~= 42 then
        return false
    end
    
    local pattern = "^0x[0-9a-fA-F]+$"
    return string.match(address, pattern) ~= nil
end

-- Admin functions --

-- 1. update payment token USD price
Handlers.add(
    "UpdatePaymentTokenPrice",
    Handlers.utils.hasMatchingTag("Action", "UpdatePaymentTokenPrice"),
    function(msg)
        local new_price = tonumber(msg.Tags.Price)

        if msg.From ~= Admin then
            msg.reply(
                {
                    Data = "Error: Only process owner can update payment token price",
                    Error = "UNAUTHORIZED"
                }
            )
            return
        end
        
        if new_price <= 0 then 
            msg.reply(
                {
                    Data = "Error invalid payment token price",
                    Error = "INVALID_INPUT"
                }
            )
            return
        end

        PaymentTokenUsdPrice = new_price

        ao.send(
            {
                Target = msg.From,
                Tags = {["Updated-Payment-Token-Price"] = new_price}
            }
        )
    end
)

-- 2. withdraw process payment token balance

Handlers.add(
    "WithdrawPaymentTokens",
    {Action = "WithdrawPaymentTokens"},
    function(msg)
        -- Check if sender is the process owner
        if msg.From ~= Admin then
            msg.reply(
                {
                    Data = "Error: Only process owner can withdraw payment tokens",
                    Error = "UNAUTHORIZED"
                }
            )
            return
        end

        local withdrawAmount = tonumber(msg.Tags.Quantity or msg.Data)

        -- Validate withdrawal amount
        if not withdrawAmount or withdrawAmount <= 0 then
            msg.reply(
                {
                    Data = "Error: Invalid withdrawal amount",
                    Error = "INVALID_AMOUNT"
                }
            )
            return
        end

        -- Send payment tokens to admin
        ao.send(
            {
                Target = PaymentTokenId,
                Action = "Transfer",
                Recipient = Admin,
                Quantity = tostring(withdrawAmount)
            }
        )

        msg.reply(
            {
                Data = "Successfully withdrew " .. withdrawAmount .. " payment tokens to ",
                Tags = {
                    Action = "Withdrawal-Complete",
                    Quantity = tostring(withdrawAmount),
                    Recipient = Admin
                }
            }
        )
    end
)

-- 3. batch reduce user's credit balance

Handlers.add(
    "BatchReduceCredits",
    {Action = "BatchReduceCredits"},
    function(msg)

        if msg.From ~= Admin then
            msg.reply(
                {
                    Data = "Error: Only process owner can batch reduce credits",
                    Error = "UNAUTHORIZED"
                }
            )
            return
        end

        -- Parse batch data from msg.Data
        local success, batchData = pcall(json.decode, msg.Data)
        if not success or not batchData then
            msg.reply(
                {
                    Data = json.encode(
                        {
                            error = "Invalid JSON data format"
                        }
                    ),
                    Error = "INVALID_DATA"
                }
            )
            return
        end

        local results = {
            processed = 0,
            errors = {},
            summary = {}
        }

        -- Loop over batch data and reduce credits
        for userAddress, reductionAmount in pairs(batchData) do
            local amount = tonumber(reductionAmount)

            if not amount or amount < 0 then
                table.insert(
                    results.errors,
                    {
                        user = userAddress,
                        error = "Invalid reduction amount: " .. tostring(reductionAmount)
                    }
                )
            else
                -- Get current balance (default to 0 if user doesn't exist)
                local currentBalance = Credits[userAddress] or 0

                -- Calculate new balance (don't go below 0)
                local newBalance = math.max(0, currentBalance - amount)
                local actualReduction = currentBalance - newBalance

                -- Update credits
                Credits[userAddress] = newBalance

                -- Track results
                results.summary[userAddress] = {
                    previousBalance = currentBalance,
                    reductionRequested = amount,
                    actualReduction = actualReduction,
                    newBalance = newBalance
                }

                results.processed = results.processed + 1
            end
        end

        -- Send response with results
        msg.reply(
            {
                Data = json.encode(
                    {
                        message = "Batch credit reduction completed",
                        results = results,
                        processedBy = msg.From
                    }
                ),
                Tags = {
                    Action = "Batch-Reduce-Credits-Response",
                    Processed = tostring(results.processed),
                    Errors = tostring(#results.errors)
                }
            }
        )
    end
)

-- Public function --

-- 1. Credits balance per user
Handlers.add(
    "Balance",
    Handlers.utils.hasMatchingTag("Action", "Balance"),
    function(msg)

        if type(msg.Tags.Target) ~= "string" then 
            msg.reply({
                Data = "Error: Balance action require a 'Target' tag",
                Error = "MISSING_TAG"
            })
            return
        end

        local bal = "0"

        if Credits[msg.Tags.Target] then
            bal = tostring(Credits[msg.Tags.Target])
        end

        ao.send(
            {
                Target = msg.From,
                Tags = {
                    ["Credits-Balance"] = bal
                }
            }
        )
    end
)

-- 2. Total Balance
Handlers.add(
    "Balances",
    "Balances",
    function(msg)
        msg.reply({Data = json.encode(Credits)})
    end
)

-- 3. Transfer credits
Handlers.add(
    "Transfer",
    Handlers.utils.hasMatchingTag("Action", "Transfer"),
    function(msg)

        if type(msg.Tags.Recipient) ~= "string" or type(msg.Tags.Quantity) ~= "string" then 
            msg.reply({
                Data = "Error: Transfer action require 'Recipient' and 'Quantity' tags",
                Error = "MISSING_TAG"
            })
            return
        end

        if not is_valid_arweave_address(msg.Tags.Recipient) or not is_valid_ethereum_address(msg.Tags.Recipient) then 
            msg.reply({
                Data = "Error: Invalid recipient address formar - only Arweave or Ethereum",
                Error = "INVALID_ADDRESS_FORMAT"
            })
            return
        end

        if not Credits[msg.From] then
            Credits[msg.From] = 0
        end

        if not Credits[msg.Tags.Recipient] then
            Credits[msg.Tags.Recipient] = 0
        end

        local qty = tonumber(msg.Tags.Quantity)

        if type(qty) ~= "number" then 
            msg.reply({
                Data = "Error: invalid quantity number passed",
                Error = "INVALID_INPUT"
            })
            return
        end

        if Credits[msg.From] >= qty then
            Credits[msg.From] = Credits[msg.From] - qty
            Credits[msg.Tags.Recipient] = Credits[msg.Tags.Recipient] + qty
            ao.send(
                {
                    Target = msg.From,
                    Tags = {
                        ["Action"] = "Debit-Notice",
                        ["Credits-Quantity"] = tostring(qty)
                    }
                }
            )
            ao.send(
                {
                    Target = msg.Tags.Recipient,
                    Tags = {
                        ["Action"] = "Credit-Notice",
                        ["Credits-Quantity"] = tostring(qty)
                    }
                }
            )
        end
    end
)

-- 4. Buy credits using the supported payment token
Handlers.add(
    "BuyCredits",
    {
        Action = "Credit-Notice",
        ["From-Process"] = PaymentTokenId
    },
    function(msg)
        local sender = msg.Tags.Sender or msg.From
        local quantity = tonumber(msg.Tags.Quantity or msg.Data) / (10 ^ PaymentTokenDenomination)

        if PaymentTokenUsdPrice <= 0 then 
            msg.reply({
                Data = "Error: invalid token price USD - requires admin attention",
                Error = "INVALID_INPUT"
            })
            return
        end

        if not quantity or quantity <= 0 then 
            msg.reply({
                Data = "Error: invalid token price USD",
                Error = "INVALID_INPUT"
            })
            return
        end

        -- Initialize sender in Credits if it doesn't exist
        if not Credits[sender] then
            Credits[sender] = 0
        end
        local purchasedCredits = quantity * PaymentTokenUsdPrice
        Credits[sender] = Credits[sender] + purchasedCredits

        print(
            "Received " ..
                quantity .. " payment tokens from " .. sender .. " exchanged for " .. purchasedCredits .. " credits"
        )
        print("User credits: " .. Credits[sender])

        ao.send(
            {
                Target = sender,
                Data = "Successfully purchased " .. purchasedCredits .. " credits",
                Tags = {
                    Action = "Receipt-Confirmation",
                    PurchasedCredits = tostring(purchasedCredits),
                    CreditsBalance = tostring(Credits[sender])
                }
            }
        )
    end
)

-- 5. Info handler

Handlers.add(
    "Info",
    Handlers.utils.hasMatchingTag("Action", "Info"),
    function(msg)
        msg.reply(
            {
                Name = Name,
                Admin = Admin,
                PaymentTokenId = PaymentTokenId,
                PaymentTokenTicker = PaymentTokenTicker,
                PaymentTokenUsdPrice = PaymentTokenUsdPrice
            }
        )
    end
)
