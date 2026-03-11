import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CategoryListComponent } from './category-list.component';
import { CategoryService } from '../../core/services/category.service';

const CAT_1 = { id: 1, creatorId: 1, name: 'Science', description: null, createdAt: '', updatedAt: '' };
const CAT_2 = { id: 2, creatorId: 1, name: 'History', description: 'Old stuff', createdAt: '', updatedAt: '' };

function makeMockCategoryService(items = [CAT_1, CAT_2], total = 2) {
  return {
    getCategories: vi.fn().mockResolvedValue({ success: true, data: { items, total } }),
    createCategory: vi.fn().mockResolvedValue({ success: true, data: CAT_1 }),
    updateCategory: vi.fn().mockResolvedValue({ success: true, data: CAT_1 }),
    deleteCategory: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
}

async function setup(catService = makeMockCategoryService()) {
  TestBed.configureTestingModule({
    imports: [CategoryListComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: CategoryService, useValue: catService },
    ],
  });

  const fixture = TestBed.createComponent(CategoryListComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // triggers ngOnInit → loadCategories()
  await Promise.resolve(); // allow loadCategories() promise to settle

  return { fixture, component, catService };
}

describe('CategoryListComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // -- Initial load ---------------------------------------------------

  it('loads categories on init', async () => {
    const { component } = await setup();
    expect(component.categories()).toHaveLength(2);
    expect(component.total()).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('sets error when load fails', async () => {
    const catService = makeMockCategoryService();
    catService.getCategories.mockRejectedValue(new Error('Network error'));
    const { component } = await setup(catService);
    expect(component.error()).toBe('Failed to load categories.');
    expect(component.loading()).toBe(false);
  });

  // -- Pagination -----------------------------------------------------

  it('computes currentPage and totalPages', async () => {
    const catService = makeMockCategoryService([CAT_1], 45);
    const { component } = await setup(catService);
    expect(component.currentPage()).toBe(1);
    expect(component.totalPages()).toBe(3); // ceil(45/20)
  });

  it('hasPrev is false on first page, hasNext true when more items exist', async () => {
    const catService = makeMockCategoryService([CAT_1], 25);
    const { component } = await setup(catService);
    expect(component.hasPrev()).toBe(false);
    expect(component.hasNext()).toBe(true);
  });

  it('nextPage increments offset and reloads', async () => {
    const catService = makeMockCategoryService([CAT_1], 25);
    catService.getCategories
      .mockResolvedValueOnce({ success: true, data: { items: [CAT_1], total: 25 } })
      .mockResolvedValueOnce({ success: true, data: { items: [CAT_2], total: 25 } });
    const { component } = await setup(catService);

    component.nextPage();
    await Promise.resolve();

    expect(component.offset()).toBe(20);
    expect(component.hasPrev()).toBe(true);
    expect(component.hasNext()).toBe(false);
  });

  it('prevPage decrements offset and reloads', async () => {
    const catService = makeMockCategoryService([CAT_1], 25);
    catService.getCategories
      .mockResolvedValueOnce({ success: true, data: { items: [CAT_1], total: 25 } })
      .mockResolvedValueOnce({ success: true, data: { items: [CAT_2], total: 25 } })
      .mockResolvedValueOnce({ success: true, data: { items: [CAT_1], total: 25 } });
    const { component } = await setup(catService);

    component.nextPage();
    await Promise.resolve();
    component.prevPage();
    await Promise.resolve();

    expect(component.offset()).toBe(0);
  });

  // -- Create form ----------------------------------------------------

  it('openCreateForm shows form with empty fields', async () => {
    const { component } = await setup();
    component.openCreateForm();
    expect(component.showForm()).toBe(true);
    expect(component.editing()).toBeNull();
    expect(component.form.value.name).toBe('');
    expect(component.form.value.description).toBe('');
  });

  it('cancelForm hides form and clears editing', async () => {
    const { component } = await setup();
    component.openCreateForm();
    component.cancelForm();
    expect(component.showForm()).toBe(false);
    expect(component.editing()).toBeNull();
  });

  it('submitting create form calls createCategory and reloads', async () => {
    const { component, catService } = await setup();
    component.openCreateForm();
    component.form.setValue({ name: 'New Cat', description: '' });

    await component.submitForm();

    expect(catService.createCategory).toHaveBeenCalledWith('New Cat', '');
    expect(catService.getCategories).toHaveBeenCalledTimes(2); // init + reload
    expect(component.showForm()).toBe(false);
  });

  it('create form shows error on failure', async () => {
    const catService = makeMockCategoryService();
    catService.createCategory.mockRejectedValue(new Error('Server error'));
    const { component } = await setup(catService);

    component.openCreateForm();
    component.form.setValue({ name: 'Bad Cat', description: '' });
    await component.submitForm();

    expect(component.error()).toBe('Failed to create category.');
  });

  it('does not submit when form is invalid', async () => {
    const { component, catService } = await setup();
    component.openCreateForm();
    component.form.setValue({ name: '', description: '' });
    await component.submitForm();
    expect(catService.createCategory).not.toHaveBeenCalled();
  });

  // -- Edit form ------------------------------------------------------

  it('openEditForm pre-fills form with category values', async () => {
    const { component } = await setup();
    component.openEditForm(CAT_2);
    expect(component.editing()).toEqual(CAT_2);
    expect(component.form.value.name).toBe('History');
    expect(component.form.value.description).toBe('Old stuff');
  });

  it('submitting edit form calls updateCategory and reloads', async () => {
    const { component, catService } = await setup();
    component.openEditForm(CAT_1);
    component.form.setValue({ name: 'Renamed', description: '' });

    await component.submitForm();

    expect(catService.updateCategory).toHaveBeenCalledWith(CAT_1.id, 'Renamed', '');
    expect(catService.getCategories).toHaveBeenCalledTimes(2); // init + reload
    expect(component.showForm()).toBe(false);
  });

  it('edit form shows error on failure', async () => {
    const catService = makeMockCategoryService();
    catService.updateCategory.mockRejectedValue(new Error('Server error'));
    const { component } = await setup(catService);

    component.openEditForm(CAT_1);
    component.form.setValue({ name: 'Renamed', description: '' });
    await component.submitForm();

    expect(component.error()).toBe('Failed to update category.');
  });

  // -- Delete ---------------------------------------------------------

  it('deleteCategory calls deleteCategory and reloads on confirm', async () => {
    const { component, catService } = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.deleteCategory(1);

    expect(catService.deleteCategory).toHaveBeenCalledWith(1);
    expect(catService.getCategories).toHaveBeenCalledTimes(2); // init + reload
    expect(component.error()).toBeNull();
  });

  it('deleteCategory does nothing when confirm is cancelled', async () => {
    const { component, catService } = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.deleteCategory(1);

    expect(catService.deleteCategory).not.toHaveBeenCalled();
  });

  it('deleteCategory shows generic error on server failure', async () => {
    const catService = makeMockCategoryService();
    catService.deleteCategory.mockRejectedValue(new Error('Server error'));
    const { component } = await setup(catService);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.deleteCategory(1);

    expect(component.error()).toBe('Failed to delete category.');
  });

  it('deleteCategory shows specific error for CATEGORY_IN_USE', async () => {
    const catService = makeMockCategoryService();
    catService.deleteCategory.mockRejectedValue({ error: { error: { code: 'CATEGORY_IN_USE' } } });
    const { component } = await setup(catService);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.deleteCategory(1);

    expect(component.error()).toBe('This category is used in a saved game and cannot be deleted.');
  });
});
