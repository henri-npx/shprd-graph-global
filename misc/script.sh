# BSC :

# ARBITRUM :

# AVALANCHE :

# MATIC :

# {
#   "name": "Shprd",
#   "license": "UNLICENSED",
#   "scripts": {
#     "codegen": "graph codegen",
#     "build": "graph build",
#     "deploy": "graph deploy --node https://api.thegraph.com/deploy/ henri-npx/ShprdMatic",
#     "create-local": "graph create --node http://localhost:8020/ henri-npx/ShprdMatic",
#     "remove-local": "graph remove --node http://localhost:8020/ henri-npx/ShprdMatic",
#     "deploy-local": "graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 henri-npx/ShprdMatic"
#   },
#   "dependencies": {
#     "@graphprotocol/graph-cli": "0.29.2",
#     "@graphprotocol/graph-ts": "0.26.0"
#   },
#   "devDependencies": {
#     "matchstick-as": "^0.5.0"
#   }
# }

# To prepare the subgraph.yaml for a specific chain before deployement update the networks.json if needed and run :
# This will update the subgraph.yaml and it will be ready for deployement.
yarn build --network _network_name_
