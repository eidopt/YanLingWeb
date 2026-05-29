import type { ThemeLayoutNode, ThemeLayoutWidgetPolicy, ThemeLibraryDependency, ValidationIssue } from '../types';
import {
  isJsonSerializable,
  isNonEmptyString,
  isPlainObject,
  isSafePublicJsonEndpoint,
  issue,
  validateDataSelector,
} from './themeLayoutValidator.shared';
import {
  DISALLOWED_WIDGET_PROP_NAMES,
  formatAllowedWidgetLibraries,
  getAllowedWidgetLibraryByName,
  getWidgetLibraryPolicyKeys,
  getWidgetRendererCapability,
  isAllowedWidgetDependency,
  isSupportedWidgetCapability,
  isWidgetRendererCapabilityAllowedByPolicy,
  isWidgetRuntimePolicyEnabled,
  resolveSafeWidgetRenderer,
  SUPPORTED_WIDGET_CAPABILITIES,
  SUPPORTED_WIDGET_RENDERERS,
} from './widgetSafety';

export function validateDependencies(
  dependencies: ThemeLibraryDependency[] | undefined,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): Set<string> {
  const dependencyNames = new Set<string>();
  if (dependencies === undefined) {
    return dependencyNames;
  }

  if (!Array.isArray(dependencies)) {
    errors.push(issue('error', 'dependencies', 'invalid_dependencies', 'dependencies must be an array'));
    return dependencyNames;
  }

  dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    if (!isPlainObject(dependency)) {
      errors.push(issue('error', path, 'invalid_dependency', 'Dependency must be an object'));
      return;
    }
    if (!isNonEmptyString(dependency.name)) {
      errors.push(issue('error', `${path}.name`, 'missing_dependency_name', 'Dependency name is required'));
    } else if (dependencyNames.has(dependency.name)) {
      errors.push(
        issue('error', `${path}.name`, 'duplicate_dependency_name', `Duplicate dependency: ${dependency.name}`),
      );
    } else {
      dependencyNames.add(dependency.name);
    }
    if (
      !isNonEmptyString(dependency.name) ||
      !isNonEmptyString(dependency.url) ||
      !isAllowedWidgetDependency(dependency.name, dependency.url, widgetPolicy)
    ) {
      errors.push(
        issue(
          'error',
          `${path}.url`,
          'blocked_dependency_url',
          'Widget dependencies must use approved esm.sh packages allowed by widgetPolicy: ' +
            formatAllowedWidgetLibraries(),
        ),
      );
      return;
    }

    const library = getAllowedWidgetLibraryByName(dependency.name);
    if (library) {
      getWidgetLibraryPolicyKeys(library).forEach((key) => dependencyNames.add(key));
    }
  });

  return dependencyNames;
}

export function validateDataSources(dataSources: unknown, errors: ValidationIssue[]): Set<string> {
  const dataSourceIds = new Set<string>();
  if (dataSources === undefined) {
    return dataSourceIds;
  }
  if (!Array.isArray(dataSources)) {
    errors.push(issue('error', 'dataSources', 'invalid_data_sources', 'dataSources must be an array'));
    return dataSourceIds;
  }

  dataSources.forEach((dataSource, index) => {
    const path = `dataSources[${index}]`;
    if (!isPlainObject(dataSource)) {
      errors.push(issue('error', path, 'invalid_data_source', 'Data source must be an object'));
      return;
    }

    const sourceId = dataSource.id;
    const sourceKind = dataSource.kind;

    if (!isNonEmptyString(sourceId)) {
      errors.push(issue('error', `${path}.id`, 'missing_data_source_id', 'Data source id is required'));
    } else if (dataSourceIds.has(sourceId)) {
      errors.push(issue('error', `${path}.id`, 'duplicate_data_source_id', `Duplicate data source: ${sourceId}`));
    } else {
      dataSourceIds.add(sourceId);
    }

    if (sourceKind !== 'staticJson' && sourceKind !== 'publicJsonEndpoint') {
      errors.push(
        issue(
          'error',
          `${path}.kind`,
          'invalid_data_source_kind',
          'Data source kind must be staticJson or publicJsonEndpoint',
        ),
      );
      return;
    }

    validateDataSelector(dataSource.select, `${path}.select`, errors);

    if (sourceKind === 'staticJson') {
      if (!('data' in dataSource)) {
        errors.push(issue('error', `${path}.data`, 'missing_static_json_data', 'staticJson data is required'));
      } else if (!isJsonSerializable(dataSource.data)) {
        errors.push(
          issue('error', `${path}.data`, 'invalid_static_json_data', 'staticJson data must be JSON serializable'),
        );
      }
    }

    if (sourceKind === 'publicJsonEndpoint') {
      if (!isNonEmptyString(dataSource.url) || !isSafePublicJsonEndpoint(dataSource.url)) {
        errors.push(
          issue(
            'error',
            `${path}.url`,
            'invalid_public_json_endpoint',
            'publicJsonEndpoint url must be a safe relative path or HTTPS URL without credentials',
          ),
        );
      }
    }

    if ('fallback' in dataSource && !isJsonSerializable(dataSource.fallback)) {
      errors.push(
        issue(
          'error',
          `${path}.fallback`,
          'invalid_data_source_fallback',
          'Data source fallback must be JSON serializable',
        ),
      );
    }
  });

  return dataSourceIds;
}

export function validateWidgetPolicy(policy: ThemeLayoutWidgetPolicy | undefined, errors: ValidationIssue[]): void {
  if (policy === undefined) {
    return;
  }

  if (!isPlainObject(policy)) {
    errors.push(issue('error', 'widgetPolicy', 'invalid_widget_policy', 'widgetPolicy must be an object'));
    return;
  }

  if (policy.enabled !== undefined && typeof policy.enabled !== 'boolean') {
    errors.push(
      issue('error', 'widgetPolicy.enabled', 'invalid_widget_policy_enabled', 'widgetPolicy.enabled must be a boolean'),
    );
  }

  if (policy.allowedLibraries !== undefined) {
    if (!Array.isArray(policy.allowedLibraries)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedLibraries',
          'invalid_widget_policy_libraries',
          'widgetPolicy.allowedLibraries must be an array',
        ),
      );
    } else {
      policy.allowedLibraries.forEach((library, index) => {
        if (!isNonEmptyString(library) || !getAllowedWidgetLibraryByName(library)) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedLibraries[${index}]`,
              'invalid_widget_policy_library',
              `widgetPolicy.allowedLibraries must reference approved libraries: ${formatAllowedWidgetLibraries()}`,
            ),
          );
        }
      });
    }
  }

  if (policy.allowedRenderers !== undefined) {
    if (!Array.isArray(policy.allowedRenderers)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedRenderers',
          'invalid_widget_policy_renderers',
          'widgetPolicy.allowedRenderers must be an array',
        ),
      );
    } else {
      policy.allowedRenderers.forEach((renderer, index) => {
        if (!isNonEmptyString(renderer) || !SUPPORTED_WIDGET_RENDERERS.has(renderer.trim().toLowerCase())) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedRenderers[${index}]`,
              'invalid_widget_policy_renderer',
              `widgetPolicy.allowedRenderers must be one of: ${[...SUPPORTED_WIDGET_RENDERERS].join(', ')}`,
            ),
          );
        }
      });
    }
  }

  if (policy.allowedCapabilities !== undefined) {
    if (!Array.isArray(policy.allowedCapabilities)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedCapabilities',
          'invalid_widget_policy_capabilities',
          'widgetPolicy.allowedCapabilities must be an array',
        ),
      );
    } else {
      policy.allowedCapabilities.forEach((capability, index) => {
        if (!isNonEmptyString(capability) || !isSupportedWidgetCapability(capability)) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedCapabilities[${index}]`,
              'invalid_widget_policy_capability',
              `widgetPolicy.allowedCapabilities must be one of: ${[...SUPPORTED_WIDGET_CAPABILITIES].join(', ')}`,
            ),
          );
        }
      });
    }
  }
}

export function validateWidgetProps(
  alias: string,
  propsValue: unknown,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (alias !== 'core.widget') {
    return;
  }

  if (!isWidgetRuntimePolicyEnabled(widgetPolicy)) {
    errors.push(
      issue(
        'error',
        path,
        'widget_disabled_by_policy',
        'core.widget is disabled by layoutDocument.widgetPolicy.enabled=false',
      ),
    );
  }

  const props = isPlainObject(propsValue) ? propsValue : {};
  Object.keys(props).forEach((propName) => {
    if (DISALLOWED_WIDGET_PROP_NAMES.has(propName)) {
      errors.push(
        issue(
          'error',
          `${path}.props.${propName}`,
          'custom_widget_script_blocked',
          `core.widget does not allow custom script prop "${propName}"`,
        ),
      );
    }
  });

  if (!isNonEmptyString(props.library)) {
    errors.push(
      issue('error', `${path}.props.library`, 'missing_widget_library', 'core.widget requires a library name'),
    );
    return;
  }

  const library = getAllowedWidgetLibraryByName(props.library);
  const libraryKeys = library ? getWidgetLibraryPolicyKeys(library) : [props.library];
  if (!libraryKeys.some((key) => dependencyNames.has(key))) {
    errors.push(
      issue(
        'error',
        `${path}.props.library`,
        'missing_widget_dependency',
        `core.widget library "${props.library}" must be declared in layoutDocument.dependencies`,
      ),
    );
  }

  const renderer = typeof props.renderer === 'string' ? props.renderer : undefined;
  const resolvedRenderer = resolveSafeWidgetRenderer(props.library, renderer, widgetPolicy);
  if (!resolvedRenderer) {
    const requestedRenderer = renderer?.trim().toLowerCase();
    const requestedCapability = requestedRenderer ? getWidgetRendererCapability(requestedRenderer) : null;
    if (
      requestedRenderer &&
      requestedCapability &&
      !isWidgetRendererCapabilityAllowedByPolicy(requestedRenderer, widgetPolicy)
    ) {
      errors.push(
        issue(
          'error',
          `${path}.props.renderer`,
          'widget_capability_blocked',
          [
            `core.widget renderer "${requestedRenderer}" requires capability "${requestedCapability}"`,
            'not allowed by widgetPolicy.allowedCapabilities',
          ].join(' '),
        ),
      );
    } else {
      errors.push(
        issue(
          'error',
          `${path}.props.renderer`,
          'unsupported_widget_renderer',
          `core.widget renderer must be one of: ${[...SUPPORTED_WIDGET_RENDERERS].join(', ')}`,
        ),
      );
    }
  }
}

export function validateWidgetNode(
  node: ThemeLayoutNode,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  validateWidgetProps(node.alias, node.props, path, dependencyNames, widgetPolicy, errors);
}

function validateTemplateNodeWidgets(
  value: unknown,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    return;
  }

  const alias = typeof value.alias === 'string' ? value.alias : '';
  validateWidgetProps(alias, value.props, path, dependencyNames, widgetPolicy, errors);

  const children = Array.isArray(value.children) ? value.children : [];
  children.forEach((child, index) => {
    validateTemplateNodeWidgets(child, `${path}.children[${index}]`, dependencyNames, widgetPolicy, errors);
  });
}

export function validateComponentTemplateWidgets(
  componentTemplates: Record<string, unknown> | undefined,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (!componentTemplates) {
    return;
  }

  Object.entries(componentTemplates).forEach(([alias, template]) => {
    if (!isPlainObject(template)) {
      return;
    }
    validateTemplateNodeWidgets(
      template.root,
      `componentTemplates.${alias}.root`,
      dependencyNames,
      widgetPolicy,
      errors,
    );
  });
}
