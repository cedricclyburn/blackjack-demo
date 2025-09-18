#!/bin/bash

# Deploy Blackjack Game to OpenShift
# This script builds and deploys the blackjack game to the OpenShift cluster

set -e

# Configuration
NAMESPACE="blackjack-ai-demo"
APP_NAME="blackjack"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment of Blackjack Game to OpenShift...${NC}"

# Check if logged in to OpenShift
if ! oc whoami >/dev/null 2>&1; then
    echo -e "${RED}Error: Not logged in to OpenShift. Please run 'oc login' first.${NC}"
    exit 1
fi

# Check current namespace
CURRENT_NS=$(oc project -q 2>/dev/null || echo "")
if [ "$CURRENT_NS" != "$NAMESPACE" ]; then
    echo -e "${YELLOW}Switching to namespace: $NAMESPACE${NC}"
    oc project $NAMESPACE || {
        echo -e "${RED}Error: Cannot switch to namespace $NAMESPACE. Make sure it exists.${NC}"
        exit 1
    }
fi

# Get the internal registry route
echo -e "${GREEN}Getting OpenShift internal registry route...${NC}"
REGISTRY_ROUTE=$(oc get route -n openshift-image-registry default-route -o jsonpath='{.spec.host}' 2>/dev/null || echo "")

if [ -z "$REGISTRY_ROUTE" ]; then
    echo -e "${RED}Error: Could not find OpenShift internal registry route.${NC}"
    echo -e "${YELLOW}Trying to expose the registry...${NC}"
    oc patch configs.imageregistry.operator.openshift.io/cluster --patch '{"spec":{"defaultRoute":true}}' --type=merge
    sleep 5
    REGISTRY_ROUTE=$(oc get route -n openshift-image-registry default-route -o jsonpath='{.spec.host}')
fi

if [ -z "$REGISTRY_ROUTE" ]; then
    echo -e "${RED}Error: Failed to get registry route. Please ensure the OpenShift image registry is properly configured.${NC}"
    exit 1
fi

# Build the image locally
echo -e "${GREEN}Building container image...${NC}"
podman build -t ${APP_NAME}:${IMAGE_TAG} -f Containerfile . || {
    echo -e "${RED}Error: Failed to build container image. Make sure podman is installed and the Containerfile is correct.${NC}"
    exit 1
}

# Tag the image for the OpenShift registry
FULL_IMAGE_NAME="${REGISTRY_ROUTE}/${NAMESPACE}/${APP_NAME}:${IMAGE_TAG}"
echo -e "${GREEN}Tagging image as: $FULL_IMAGE_NAME${NC}"
podman tag ${APP_NAME}:${IMAGE_TAG} ${FULL_IMAGE_NAME}

# Login to the OpenShift registry
echo -e "${GREEN}Logging in to OpenShift registry...${NC}"
podman login -u $(oc whoami) -p $(oc whoami -t) ${REGISTRY_ROUTE} --tls-verify=false || {
    echo -e "${RED}Error: Failed to login to OpenShift registry.${NC}"
    exit 1
}

# Push the image
echo -e "${GREEN}Pushing image to OpenShift registry...${NC}"
podman push ${FULL_IMAGE_NAME} --tls-verify=false || {
    echo -e "${RED}Error: Failed to push image to registry.${NC}"
    exit 1
}

# Apply Kubernetes resources
echo -e "${GREEN}Applying Kubernetes resources...${NC}"
oc apply -k kubernetes/blackjack/ || {
    echo -e "${RED}Error: Failed to apply Kubernetes resources.${NC}"
    exit 1
}

# Wait for deployment to be ready
echo -e "${GREEN}Waiting for deployment to be ready...${NC}"
oc rollout status deployment/${APP_NAME}-app -n ${NAMESPACE} --timeout=300s || {
    echo -e "${RED}Error: Deployment failed to become ready.${NC}"
    echo -e "${YELLOW}Checking pod logs:${NC}"
    oc logs -l app=${APP_NAME} --tail=50
    exit 1
}

# Get the route URL
ROUTE_URL=$(oc get route ${APP_NAME}-app -o jsonpath='{.spec.host}')
if [ -n "$ROUTE_URL" ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}Your Blackjack game is available at: https://${ROUTE_URL}${NC}"
    echo -e "${YELLOW}Note: The app is configured to use the Mistral model through the Llama Stack API.${NC}"
else
    echo -e "${RED}Error: Could not get route URL.${NC}"
    exit 1
fi

# Show deployment info
echo -e "\n${GREEN}Deployment Information:${NC}"
echo "Namespace: $NAMESPACE"
echo "App Name: $APP_NAME"
echo "Llama Stack Endpoint: http://llamastack-server:8321"
echo "Model: mistral-small-24b-w8a8"

echo -e "\n${GREEN}Useful commands:${NC}"
echo "View logs: oc logs -f -l app=${APP_NAME}"
echo "Get pods: oc get pods -l app=${APP_NAME}"
echo "Describe deployment: oc describe deployment ${APP_NAME}-app"
echo "Access shell: oc exec -it deployment/${APP_NAME}-app -- /bin/sh"
