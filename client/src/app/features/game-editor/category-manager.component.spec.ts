import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import type { Category, ApiResponse, PaginatedResponse } from '@extriviate/shared';
import { CategoryManagerComponent } from './category-manager.component';
import { CategoryService } from '../../core/services/category.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    creatorId: 10,
    name: 'Science',
    description: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function paginatedResponse(items: Category[]): ApiResponse<PaginatedResponse<Category>> {
  return {
    success: true,
    data: { items, total: items.length, limit: 20, offset: 0 },
  };
}

function buildCategoryServiceStub(categories: Category[] = [makeCategory()]) {
  return {
    getCategories: vi.fn().mockResolvedValue(paginatedResponse(categories)),
    createCategory: vi.fn().mockResolvedValue({ success: true, data: makeCategory() }),
    updateCategory: vi.fn().mockResolvedValue({ success: true, data: makeCategory() }),
    deleteCategory: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CategoryManagerComponent', () => {
  let fixture: ComponentFixture<CategoryManagerComponent>;
  let component: CategoryManagerComponent;
  let catStub: ReturnType<typeof buildCategoryServiceStub>;

  async function setup(
    categories: Category[] = [makeCategory()],
    excludedIds: Set<number> = new Set(),
  ): Promise<HTMLElement> {
    catStub = buildCategoryServiceStub(categories);

    TestBed.configureTestingModule({
      imports: [CategoryManagerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CategoryService, useValue: catStub },
      ],
    });

    fixture = TestBed.createComponent(CategoryManagerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('excludedIds', excludedIds);
    fixture.detectChanges();

    // Wait for ngOnInit → loadCategories() to resolve
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ─── Initialisation ───────────────────────────────────────────────────────

  it('calls getCategories() on init', async () => {
    await setup();
    expect(catStub.getCategories).toHaveBeenCalledOnce();
  });

  it('renders a list item for each loaded category', async () => {
    const cats = [makeCategory({ id: 1, name: 'Science' }), makeCategory({ id: 2, name: 'History' })];
    const el = await setup(cats);
    expect(el.querySelectorAll('.cat-list__item').length).toBe(2);
  });

  it('shows category name in the list', async () => {
    const el = await setup([makeCategory({ name: 'Geography' })]);
    expect(el.querySelector('.cat-list__name')?.textContent?.trim()).toBe('Geography');
  });

  it('shows category description when present', async () => {
    const el = await setup([makeCategory({ description: 'About places' })]);
    expect(el.querySelector('.cat-list__desc')?.textContent?.trim()).toBe('About places');
  });

  it('shows empty-state message when no categories are returned', async () => {
    const el = await setup([]);
    expect(el.querySelector('.cat-list__empty')).not.toBeNull();
  });

  // ─── excluded categories ──────────────────────────────────────────────────

  it('disables the select button for excluded category IDs', async () => {
    const cat = makeCategory({ id: 5 });
    const el = await setup([cat], new Set([5]));
    const btn = el.querySelector('.cat-list__select') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows "In use" badge for excluded categories', async () => {
    const cat = makeCategory({ id: 5 });
    const el = await setup([cat], new Set([5]));
    expect(el.querySelector('.cat-list__used-badge')).not.toBeNull();
  });

  it('does not disable the select button for non-excluded categories', async () => {
    const cat = makeCategory({ id: 5 });
    const el = await setup([cat], new Set([99]));
    const btn = el.querySelector('.cat-list__select') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // ─── selectCategory() ─────────────────────────────────────────────────────

  it('selectCategory() emits the chosen category via categorySelected output', async () => {
    const cat = makeCategory({ id: 3, name: 'Art' });
    await setup([cat]);

    const emitted: Category[] = [];
    component.categorySelected.subscribe((c) => emitted.push(c));

    component.selectCategory(cat);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(cat);
  });

  it('clicking the select button emits categorySelected', async () => {
    const cat = makeCategory({ id: 4, name: 'Music' });
    const el = await setup([cat]);

    const emitted: Category[] = [];
    component.categorySelected.subscribe((c) => emitted.push(c));

    (el.querySelector('.cat-list__select') as HTMLButtonElement).click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toBe('Music');
  });

  // ─── openCreateForm() ────────────────────────────────────────────────────

  it('openCreateForm() sets showForm to true', async () => {
    await setup();
    component.openCreateForm();
    expect(component.showForm()).toBe(true);
  });

  it('openCreateForm() clears editing to null', async () => {
    await setup([makeCategory()]);
    component.openEditForm(makeCategory());
    component.openCreateForm();
    expect(component.editing()).toBeNull();
  });

  it('clicking "New Category" button shows the form', async () => {
    const el = await setup();
    (el.querySelector('.btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.cat-form')).not.toBeNull();
  });

  it('form submit button reads "Create" in create mode', async () => {
    const el = await setup();
    component.openCreateForm();
    fixture.detectChanges();
    const submitBtn = el.querySelector('.cat-form [type="submit"]') as HTMLButtonElement;
    expect(submitBtn.textContent?.trim()).toBe('Create');
  });

  // ─── openEditForm() ───────────────────────────────────────────────────────

  it('openEditForm() sets editing to the chosen category', async () => {
    const cat = makeCategory({ id: 7, name: 'Sport' });
    await setup([cat]);
    component.openEditForm(cat);
    expect(component.editing()).toEqual(cat);
  });

  it('openEditForm() populates formName with the category name', async () => {
    const cat = makeCategory({ name: 'Literature' });
    await setup([cat]);
    component.openEditForm(cat);
    expect(component.formName()).toBe('Literature');
  });

  it('openEditForm() populates formDescription with the category description', async () => {
    const cat = makeCategory({ description: 'Books and writing' });
    await setup([cat]);
    component.openEditForm(cat);
    expect(component.formDescription()).toBe('Books and writing');
  });

  it('form submit button reads "Update" in edit mode', async () => {
    const cat = makeCategory();
    const el = await setup([cat]);
    component.openEditForm(cat);
    fixture.detectChanges();
    const submitBtn = el.querySelector('.cat-form [type="submit"]') as HTMLButtonElement;
    expect(submitBtn.textContent?.trim()).toBe('Update');
  });

  // ─── cancelForm() ─────────────────────────────────────────────────────────

  it('cancelForm() hides the form', async () => {
    await setup();
    component.openCreateForm();
    component.cancelForm();
    expect(component.showForm()).toBe(false);
  });

  it('clicking the Cancel button hides the form', async () => {
    const el = await setup();
    component.openCreateForm();
    fixture.detectChanges();
    (el.querySelector('.btn--ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.cat-form')).toBeNull();
  });

  // ─── submitForm() — create ────────────────────────────────────────────────

  it('submitForm() calls createCategory with the trimmed name when not editing', async () => {
    await setup();
    component.openCreateForm();
    component.formName.set('  New Cat  ');
    await component.submitForm();
    expect(catStub.createCategory).toHaveBeenCalledWith('New Cat', undefined);
  });

  it('submitForm() calls createCategory with description when description is provided', async () => {
    await setup();
    component.openCreateForm();
    component.formName.set('Trivia');
    component.formDescription.set('General trivia');
    await component.submitForm();
    expect(catStub.createCategory).toHaveBeenCalledWith('Trivia', 'General trivia');
  });

  it('submitForm() does nothing when name is empty', async () => {
    await setup();
    component.openCreateForm();
    component.formName.set('   ');
    await component.submitForm();
    expect(catStub.createCategory).not.toHaveBeenCalled();
  });

  it('submitForm() closes the form after successful create', async () => {
    await setup();
    component.openCreateForm();
    component.formName.set('Valid Name');
    await component.submitForm();
    // Wait for the reload's resolved promise
    await Promise.resolve();
    await Promise.resolve();
    expect(component.showForm()).toBe(false);
  });

  it('submitForm() reloads categories after successful create', async () => {
    await setup();
    component.openCreateForm();
    component.formName.set('Another');
    await component.submitForm();
    await Promise.resolve();
    await Promise.resolve();
    // getCategories called once on init, once on reload
    expect(catStub.getCategories).toHaveBeenCalledTimes(2);
  });

  it('submitForm() sets error when createCategory rejects', async () => {
    await setup();
    catStub.createCategory.mockRejectedValueOnce(new Error('Network error'));
    component.openCreateForm();
    component.formName.set('Oops');
    await component.submitForm();
    expect(component.error()).toBe('Failed to create category.');
  });

  // ─── submitForm() — update ────────────────────────────────────────────────

  it('submitForm() calls updateCategory with id and trimmed name when editing', async () => {
    const cat = makeCategory({ id: 8, name: 'Old Name' });
    await setup([cat]);
    component.openEditForm(cat);
    component.formName.set('New Name');
    await component.submitForm();
    expect(catStub.updateCategory).toHaveBeenCalledWith(8, 'New Name', undefined);
  });

  it('submitForm() does not call createCategory when in edit mode', async () => {
    const cat = makeCategory({ id: 2 });
    await setup([cat]);
    component.openEditForm(cat);
    component.formName.set('Updated');
    await component.submitForm();
    expect(catStub.createCategory).not.toHaveBeenCalled();
  });

  it('submitForm() sets error when updateCategory rejects', async () => {
    const cat = makeCategory({ id: 8 });
    await setup([cat]);
    catStub.updateCategory.mockRejectedValueOnce(new Error('Server error'));
    component.openEditForm(cat);
    component.formName.set('Valid');
    await component.submitForm();
    expect(component.error()).toBe('Failed to update category.');
  });

  // ─── deleteCategory() ─────────────────────────────────────────────────────

  it('deleteCategory() calls service.deleteCategory with the correct id', async () => {
    // Suppress window.confirm — auto-accept
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await setup([makeCategory({ id: 11 })]);
    await component.deleteCategory(11);
    expect(catStub.deleteCategory).toHaveBeenCalledWith(11);
  });

  it('deleteCategory() reloads categories after successful deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await setup([makeCategory({ id: 11 })]);
    await component.deleteCategory(11);
    await Promise.resolve();
    await Promise.resolve();
    // once on init + once after delete
    expect(catStub.getCategories).toHaveBeenCalledTimes(2);
  });

  it('deleteCategory() does not call service when user cancels confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup([makeCategory({ id: 11 })]);
    await component.deleteCategory(11);
    expect(catStub.deleteCategory).not.toHaveBeenCalled();
  });

  it('deleteCategory() sets error when deleteCategory rejects', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await setup([makeCategory({ id: 11 })]);
    // Override deleteCategory to reject after setup has completed
    catStub.deleteCategory.mockRejectedValueOnce(new Error('DB error'));
    await component.deleteCategory(11);
    expect(component.error()).toBe('Failed to delete category.');
  });

  // ─── error banner ─────────────────────────────────────────────────────────

  it('renders the error banner when error signal is set', async () => {
    const el = await setup();
    component.error.set('Something went wrong');
    fixture.detectChanges();
    expect(el.querySelector('.error-banner')?.textContent?.trim()).toBe('Something went wrong');
  });

  it('does not render the error banner when there is no error', async () => {
    const el = await setup();
    expect(el.querySelector('.error-banner')).toBeNull();
  });

  // ─── loading state ────────────────────────────────────────────────────────

  it('shows loading text while loadCategories is in progress', async () => {
    // Don't await setup — check mid-flight
    let resolveLoad!: (v: unknown) => void;
    catStub = buildCategoryServiceStub();
    catStub.getCategories = vi.fn().mockReturnValue(new Promise((r) => (resolveLoad = r)));

    TestBed.configureTestingModule({
      imports: [CategoryManagerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CategoryService, useValue: catStub },
      ],
    });

    fixture = TestBed.createComponent(CategoryManagerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('excludedIds', new Set());
    fixture.detectChanges();

    // loading should be true before promise resolves
    expect(component.loading()).toBe(true);

    // resolve to avoid leaking a pending promise
    resolveLoad(paginatedResponse([]));
    await Promise.resolve();
    await Promise.resolve();
  });
});
