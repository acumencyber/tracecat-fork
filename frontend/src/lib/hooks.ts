import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ActionResponse,
  actionsGetAction,
  actionsUpdateAction,
  ApiError,
  CaseEvent,
  CaseEventParams,
  CaseParams,
  CaseResponse,
  casesCreateCaseEvent,
  casesGetCase,
  casesListCaseEvents,
  casesUpdateCase,
  CreateSecretParams,
  CreateWorkspaceParams,
  EventHistoryResponse,
  Schedule,
  schedulesCreateSchedule,
  SchedulesCreateScheduleData,
  schedulesDeleteSchedule,
  SchedulesDeleteScheduleData,
  schedulesListSchedules,
  schedulesUpdateSchedule,
  SchedulesUpdateScheduleData,
  SecretResponse,
  secretsCreateSecret,
  secretsDeleteSecretById,
  secretsListSecrets,
  secretsUpdateSecretById,
  UpdateActionParams,
  UpdateSecretParams,
  WorkflowExecutionResponse,
  workflowExecutionsListWorkflowExecutionEventHistory,
  workflowExecutionsListWorkflowExecutions,
  WorkflowMetadataResponse,
  workflowsListWorkflows,
  workspacesCreateWorkspace,
  workspacesDeleteWorkspace,
  workspacesListWorkspaces,
} from "@/client"
import { useWorkflowBuilder } from "@/providers/builder"
import { useWorkspace } from "@/providers/workspace"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Cookies from "js-cookie"

import { type WorkflowMetadata } from "@/types/schemas"
import { retryHandler, TracecatApiError } from "@/lib/errors"
import { updateWebhook } from "@/lib/trigger"
import { isEmptyObject } from "@/lib/utils"
import { fetchAllPlaybooks } from "@/lib/workflow"
import { toast } from "@/components/ui/use-toast"
import { UDFNodeType } from "@/components/workbench/canvas/udf-node"

export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return defaultValue
    }
    const storedValue = localStorage.getItem(key)
    return storedValue ? JSON.parse(storedValue) : defaultValue
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue]
}

export function usePanelCase(
  workspaceId: string,
  workflowId: string,
  caseId: string
) {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<CaseResponse, ApiError>({
    queryKey: ["case", caseId],
    queryFn: async () =>
      await casesGetCase({
        workspaceId,
        caseId,
        workflowId,
      }),
  })
  const { mutateAsync } = useMutation({
    mutationFn: async (newCase: CaseParams) =>
      await casesUpdateCase({
        workspaceId,
        caseId,
        workflowId,
        requestBody: newCase,
      }),
    onSuccess: () => {
      toast({
        title: "Updated case",
        description: "Your case has been updated successfully.",
      })
      queryClient.invalidateQueries({
        queryKey: ["case", caseId],
      })
      queryClient.invalidateQueries({
        queryKey: ["cases"],
      })
    },
    onError: (error) => {
      console.error("Failed to update action:", error)
      toast({
        title: "Failed to save action",
        description: "Could not update your action. Please try again.",
      })
    },
  })

  return {
    caseData: data,
    caseIsLoading: isLoading,
    caseError: error,
    updateCaseAsync: mutateAsync,
  }
}

export function useCaseEvents(workflowId: string, caseId: string) {
  const queryClient = useQueryClient()
  const { workspaceId } = useWorkspace()
  const { data, isLoading, error } = useQuery<CaseEvent[], Error>({
    queryKey: ["caseEvents", caseId],
    queryFn: async () =>
      await casesListCaseEvents({
        workspaceId,
        workflowId,
        caseId,
      }),
  })

  const { mutateAsync } = useMutation({
    mutationFn: async (newEvent: CaseEventParams) => {
      await casesCreateCaseEvent({
        workspaceId,
        workflowId,
        caseId,
        requestBody: newEvent,
      })
    },
    onSuccess: () => {
      console.log("Case event created")
      toast({
        title: "Created case event",
        description: "Your case event has been created successfully.",
      })
      queryClient.invalidateQueries({
        queryKey: ["caseEvents", caseId],
      })
      queryClient.invalidateQueries({
        queryKey: ["case", caseId],
      })
    },
    onError: (error) => {
      console.error("Failed to create case event:", error)
      toast({
        title: "Failed to create case event",
        description: "Could not create case event. Please try again.",
      })
    },
  })

  return {
    caseEvents: data,
    caseEventsIsLoading: isLoading,
    caseEventsError: error,
    mutateCaseEventsAsync: mutateAsync,
  }
}

export type PanelAction = {
  action?: ActionResponse
  isLoading: boolean
  error: Error | null
  mutateAsync: (values: UpdateActionParams) => Promise<ActionResponse>
  queryClient: ReturnType<typeof useQueryClient>
  queryKeys: {
    selectedAction: [string, string, string]
    workflow: [string, string]
  }
}
export function usePanelAction(
  actionId: string,
  workspaceId: string,
  workflowId: string
): PanelAction {
  const queryClient = useQueryClient()
  const { setNodes } = useWorkflowBuilder()
  const {
    data: action,
    isLoading,
    error,
  } = useQuery<ActionResponse, Error>({
    queryKey: ["selected_action", actionId, workflowId],
    queryFn: async ({ queryKey }) => {
      const [, actionId, workflowId] = queryKey as [string, string, string]
      return await actionsGetAction({ workspaceId, actionId, workflowId })
    },
  })
  const { mutateAsync } = useMutation({
    mutationFn: async (values: UpdateActionParams) =>
      await actionsUpdateAction({ workspaceId, actionId, requestBody: values }),
    onSuccess: (updatedAction: ActionResponse) => {
      setNodes((nds: UDFNodeType[]) =>
        nds.map((node: UDFNodeType) => {
          if (node.id === actionId) {
            const { title } = updatedAction
            node.data = {
              ...node.data, // Overwrite the existing node data
              title,
              isConfigured:
                updatedAction.inputs !== null ||
                isEmptyObject(updatedAction.inputs),
            }
          }
          return node
        })
      )
      console.log("Action update successful", updatedAction)
      toast({
        title: "Saved action",
        description: "Your action has been updated successfully.",
      })
      queryClient.invalidateQueries({
        queryKey: ["selected_action", actionId, workflowId],
      })
      queryClient.invalidateQueries({
        queryKey: ["workflow", workflowId],
      })
    },
    onError: (error) => {
      console.error("Failed to update action:", error)
      toast({
        title: "Failed to save action",
        description: "Could not update your action. Please try again.",
      })
    },
  })
  return {
    action,
    isLoading,
    error,
    mutateAsync,
    queryClient,
    queryKeys: {
      selectedAction: ["selected_action", actionId, workflowId],
      workflow: ["workflow", workflowId],
    },
  }
}

export function useUpdateWebhook(workflowId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (params: {
      entrypointRef?: string
      method?: "GET" | "POST"
      status?: "online" | "offline"
    }) => await updateWebhook(workflowId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
    },
    onError: (error) => {
      console.error("Failed to update webhook:", error)
      toast({
        title: "Error updating webhook",
        description: "Could not update webhook. Please try again.",
        variant: "destructive",
      })
    },
  })

  return mutation
}

export function useWorkflows() {
  const { workspaceId } = useWorkspace()
  const {
    data: workflows,
    isLoading: workflowsLoading,
    error: workflowsError,
  } = useQuery<WorkflowMetadataResponse[], ApiError>({
    queryKey: ["workflows"],
    queryFn: async () => await workflowsListWorkflows({ workspaceId }),
    retry: retryHandler,
  })
  return {
    workflows,
    workflowsLoading,
    workflowsError,
  }
}

export function usePlaybooks() {
  const query = useQuery<WorkflowMetadata[], Error>({
    queryKey: ["playbooks"],
    queryFn: fetchAllPlaybooks,
  })
  return query
}
export function useWorkspaceManager() {
  const queryClient = useQueryClient()
  const router = useRouter()

  // List workspaces
  const {
    data: workspaces,
    error: workspacesError,
    isLoading: workspacesLoading,
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => await workspacesListWorkspaces(),
  })

  // Create workspace
  const { mutateAsync: createWorkspace } = useMutation({
    mutationFn: async (params: CreateWorkspaceParams) =>
      await workspacesCreateWorkspace({
        requestBody: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      toast({
        title: "Created workspace",
        description: "Your workspace has been created successfully.",
      })
    },
    onError: (error: TracecatApiError) => {
      switch (error.status) {
        case 409:
          console.log(
            "Workspace with this name already exists.",
            error.body.detail
          )
          break
        default:
          console.error("Failed to create workspace:", error)
          toast({
            title: "Error creating workspace",
            description: error.body.detail + ". Please try again.",
          })
      }
    },
  })

  // Delete workspace
  const { mutateAsync: deleteWorkspace } = useMutation({
    mutationFn: async (workspaceId: string) =>
      await workspacesDeleteWorkspace({
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      router.replace("/workspaces")
      toast({
        title: "Deleted workspace",
        description: "Your workspace has been deleted successfully.",
      })
    },
    onError: (error: TracecatApiError) => {
      switch (error.status) {
        case 400:
          toast({
            title: "Cannot delete workspace",
            description: error.body.detail,
          })
          break
        default:
          console.error("Failed to delete workspace:", error)
          toast({
            title: "Error deleting workspace",
            description: error.body.detail + ". Please try again.",
            variant: "destructive",
          })
      }
    },
  })

  // Cookies
  const getLastWorkspaceId = () =>
    Cookies.get("__tracecat:workspaces:last-viewed")
  const setLastWorkspaceId = (id?: string) =>
    Cookies.set("__tracecat:workspaces:last-viewed", id ?? "")
  const clearLastWorkspaceId = () =>
    Cookies.remove("__tracecat:workspaces:last-viewed")

  return {
    workspaces,
    workspacesError,
    workspacesLoading,
    createWorkspace,
    deleteWorkspace,
    getLastWorkspaceId,
    setLastWorkspaceId,
    clearLastWorkspaceId,
  }
}

export function useWorkflowExecutions(workflowId: string) {
  const { workspaceId } = useWorkspace()
  const {
    data: workflowExecutions,
    isLoading: workflowExecutionsIsLoading,
    error: workflowExecutionsError,
  } = useQuery<WorkflowExecutionResponse[], Error>({
    queryKey: ["workflow-executions", workflowId],
    queryFn: async () =>
      await workflowExecutionsListWorkflowExecutions({
        workspaceId,
        workflowId,
      }),
  })
  return {
    workflowExecutions,
    workflowExecutionsIsLoading,
    workflowExecutionsError,
  }
}

export function useWorkflowExecutionEventHistory(workflowExecutionId: string) {
  const { workspaceId } = useWorkspace()
  const {
    data: eventHistory,
    isLoading: eventHistoryLoading,
    error: eventHistoryError,
  } = useQuery<EventHistoryResponse[], Error>({
    queryKey: ["workflow-executions", workflowExecutionId, "event-history"],
    queryFn: async () =>
      await workflowExecutionsListWorkflowExecutionEventHistory({
        workspaceId,
        executionId: workflowExecutionId,
      }),
  })
  return {
    eventHistory,
    eventHistoryLoading,
    eventHistoryError,
  }
}

export function useSchedules(workflowId: string) {
  const queryClient = useQueryClient()
  const { workspaceId } = useWorkspace()
  // Fetch schedules
  const {
    data: schedules,
    isLoading,
    error,
  } = useQuery<Schedule[], Error>({
    queryKey: [workflowId, "schedules"],
    queryFn: async ({ queryKey }) => {
      const [workflowId] = queryKey as [string, string]
      return await schedulesListSchedules({
        workspaceId,
        workflowId,
      })
    },
  })

  // Create schedules
  const { mutateAsync: createSchedule } = useMutation({
    mutationFn: async (values: SchedulesCreateScheduleData) =>
      await schedulesCreateSchedule(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workflowId, "schedules"] })
      toast({
        title: "Created schedule",
        description: "Your schedule has been created successfully.",
      })
    },
    onError: (error) => {
      console.error("Failed to create schedule:", error)
      toast({
        title: "Error creating schedule",
        description: "Could not create schedule. Please try again.",
        variant: "destructive",
      })
    },
  })
  // Update schedules
  const { mutateAsync: updateSchedule } = useMutation({
    mutationFn: async (values: SchedulesUpdateScheduleData) =>
      await schedulesUpdateSchedule(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workflowId, "schedules"] })
      toast({
        title: "Updated schedule",
        description: "Your schedule has been updated successfully.",
      })
    },
    onError: (error) => {
      console.error("Failed to update webhook:", error)
      toast({
        title: "Error updating schedule",
        description: "Could not update schedule. Please try again.",
        variant: "destructive",
      })
    },
  })

  // Delete schedule
  const { mutateAsync: deleteSchedule } = useMutation({
    mutationFn: async (values: SchedulesDeleteScheduleData) =>
      await schedulesDeleteSchedule(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workflowId, "schedules"] })
      toast({
        title: "Deleted schedule",
        description: "Your schedule has been deleted successfully.",
      })
    },
    onError: (error) => {
      console.error("Failed to delete schedule:", error)
      toast({
        title: "Error deleting schedule",
        description: "Could not delete schedule. Please try again.",
        variant: "destructive",
      })
    },
  })

  return {
    schedules,
    schedulesIsLoading: isLoading,
    schedulesError: error,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  }
}

export function useSecrets() {
  const queryClient = useQueryClient()
  const { workspaceId } = useWorkspace()
  const {
    data: secrets,
    isLoading,
    error,
  } = useQuery<SecretResponse[], ApiError>({
    queryKey: ["secrets"],
    queryFn: async () => await secretsListSecrets({ workspaceId }),
  })

  // Create secret
  const { mutateAsync: createSecret } = useMutation({
    mutationFn: async (secret: CreateSecretParams) =>
      await secretsCreateSecret({
        workspaceId,
        requestBody: secret,
      }),
    onSuccess: () => {
      toast({
        title: "Added new secret",
        description: "New secret added successfully.",
      })
      queryClient.invalidateQueries({ queryKey: ["secrets"] })
    },
    onError: (error) => {
      console.error("Failed to add new credentials", error)
      toast({
        title: "Failed to add new secret",
        description: "An error occurred while adding the new secret.",
      })
    },
  })

  // Update secret
  const { mutateAsync: updateSecretById } = useMutation({
    mutationFn: async ({
      secretId,
      params,
    }: {
      secretId: string
      params: UpdateSecretParams
    }) =>
      await secretsUpdateSecretById({
        workspaceId,
        secretId,
        requestBody: params,
      }),
    onSuccess: () => {
      toast({
        title: "Updated secret",
        description: "Secret updated successfully.",
      })
      queryClient.invalidateQueries({ queryKey: ["secrets"] })
    },
    onError: (error) => {
      console.error("Failed to update secret", error)
      toast({
        title: "Failed to update secret",
        description: "An error occurred while the secret.",
      })
    },
  })

  // Delete secret
  const { mutateAsync: deleteSecretById } = useMutation({
    mutationFn: async (secret: SecretResponse) =>
      await secretsDeleteSecretById({ workspaceId, secretId: secret.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] })
      toast({
        title: "Deleted secret",
        description: "Secret deleted successfully.",
      })
    },
    onError: (error) => {
      console.error("Failed to delete credentials", error)
      toast({
        title: "Failed to delete secret",
        description: "An error occurred while deleting the secret.",
      })
    },
  })
  return {
    secrets,
    secretsIsLoading: isLoading,
    secretsError: error,
    createSecret,
    updateSecretById,
    deleteSecretById,
  }
}
